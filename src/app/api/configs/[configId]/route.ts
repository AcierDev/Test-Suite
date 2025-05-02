import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { Collection, ObjectId } from "mongodb";
import { HardwareConfig } from "@/components/dashboard/types";

// Define the structure of a configuration document in MongoDB (can be shared or redefined)
interface SavedConfigDocument {
  _id: ObjectId;
  name: string;
  hardware: HardwareConfig;
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

interface RouteParams {
  params: { configId: string };
}

// Helper to validate ObjectId
function isValidObjectId(id: string): boolean {
  return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
}

// GET /api/configs/[configId] - Fetch a specific configuration
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { configId } = await params;

  if (!isValidObjectId(configId)) {
    return NextResponse.json(
      { message: "Invalid Configuration ID format" },
      { status: 400 }
    );
  }

  try {
    const collection = await getConfigurationsCollection();
    const config = await collection.findOne({ _id: new ObjectId(configId) });

    if (!config) {
      return NextResponse.json(
        { message: "Configuration not found" },
        { status: 404 }
      );
    }

    console.log(`GET /api/configs/${configId} - Found config '${config.name}'`);
    return NextResponse.json(config);
  } catch (error) {
    console.error(`GET /api/configs/${configId} - Error:`, error);
    return NextResponse.json(
      {
        message: "Error fetching configuration",
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// PUT /api/configs/[configId] - Update a specific configuration
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { configId } = await params;

  if (!isValidObjectId(configId)) {
    return NextResponse.json(
      { message: "Invalid Configuration ID format" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { hardware } = body;

    // Basic validation for the hardware object structure (can be more detailed)
    if (!hardware || typeof hardware !== "object" || Array.isArray(hardware)) {
      return NextResponse.json(
        { message: "Invalid hardware data format in request body" },
        { status: 400 }
      );
    }
    // Add more specific checks for servos, steppers, etc. if needed

    const collection = await getConfigurationsCollection();
    const updateResult = await collection.updateOne(
      { _id: new ObjectId(configId) },
      {
        $set: {
          hardware: hardware,
          updatedAt: new Date(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { message: "Configuration not found" },
        { status: 404 }
      );
    }

    console.log(`PUT /api/configs/${configId} - Updated config.`);
    // Optionally fetch and return the updated document
    const updatedDoc = await collection.findOne({
      _id: new ObjectId(configId),
    });
    return NextResponse.json(updatedDoc);
  } catch (error) {
    console.error(`PUT /api/configs/${configId} - Error:`, error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { message: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        message: "Error updating configuration",
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// DELETE /api/configs/[configId] - Delete a specific configuration
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { configId } = params;

  if (!isValidObjectId(configId)) {
    return NextResponse.json(
      { message: "Invalid Configuration ID format" },
      { status: 400 }
    );
  }

  try {
    const collection = await getConfigurationsCollection();
    const deleteResult = await collection.deleteOne({
      _id: new ObjectId(configId),
    });

    if (deleteResult.deletedCount === 0) {
      return NextResponse.json(
        { message: "Configuration not found" },
        { status: 404 }
      );
    }

    console.log(`DELETE /api/configs/${configId} - Deleted config.`);
    return NextResponse.json(
      { message: "Configuration deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error(`DELETE /api/configs/${configId} - Error:`, error);
    return NextResponse.json(
      {
        message: "Error deleting configuration",
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
