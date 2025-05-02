import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { Collection, ObjectId } from "mongodb";
import { HardwareConfig } from "@/components/dashboard/types"; // Assuming your type is here

// Define the structure of a configuration document in MongoDB
interface SavedConfigDocument {
  _id: ObjectId;
  name: string;
  hardware: HardwareConfig; // Reuse the existing type
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to get the configurations collection
async function getConfigurationsCollection(): Promise<
  Collection<SavedConfigDocument>
> {
  const db = await getDb();
  return db.collection<SavedConfigDocument>("configs");
}

// GET /api/configs - Fetch list of configuration names and IDs
export async function GET(request: NextRequest) {
  try {
    const collection = await getConfigurationsCollection();
    // Fetch only necessary fields and sort by name
    const configs = await collection
      .find(
        {},
        {
          projection: { _id: 1, name: 1 },
        }
      )
      .sort({ name: 1 })
      .toArray();

    console.log("GET /api/configs - Fetched:", configs.length, "configs");
    return NextResponse.json(configs);
  } catch (error) {
    console.error("GET /api/configs - Error:", error);
    return NextResponse.json(
      {
        message: "Error fetching configurations",
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// POST /api/configs - Create a new configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        {
          message:
            "Configuration name is required and must be a non-empty string",
        },
        { status: 400 }
      );
    }

    const collection = await getConfigurationsCollection();

    // Check if config name already exists (case-insensitive check for better UX)
    const existingConfig = await collection.findOne({
      name: { $regex: `^${name.trim()}$`, $options: "i" },
    });
    if (existingConfig) {
      return NextResponse.json(
        { message: `Configuration name '${name.trim()}' already exists.` },
        { status: 409 }
      ); // 409 Conflict
    }

    const newConfig: Omit<SavedConfigDocument, "_id"> = {
      name: name.trim(),
      hardware: {
        servos: [],
        steppers: [],
        sensors: [],
        relays: [],
        pins: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newConfig as SavedConfigDocument);

    // Fetch the inserted document to return it
    const insertedDoc = await collection.findOne({ _id: result.insertedId });

    console.log(
      `POST /api/configs - Created config '${name.trim()}' with ID: ${
        result.insertedId
      }`
    );
    return NextResponse.json(insertedDoc, { status: 201 }); // 201 Created
  } catch (error) {
    console.error("POST /api/configs - Error:", error);
    // Handle potential JSON parsing errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { message: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        message: "Error creating configuration",
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
