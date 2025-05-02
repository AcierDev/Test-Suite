import fs from "fs";
import path from "path";

const IP_FILE_PATH = path.resolve(".", ".ip_address"); // Path relative to project root
let intervalId: NodeJS.Timeout | null = null;

function checkIpFile(controller: ReadableStreamDefaultController<any>) {
  console.log(`[API/IP] Checking for IP file: ${IP_FILE_PATH}`);
  if (fs.existsSync(IP_FILE_PATH)) {
    try {
      const ipContent = fs.readFileSync(IP_FILE_PATH, "utf-8").trim();
      console.log(`[API/IP] Found IP file content: ${ipContent}`);

      if (ipContent.startsWith("ERROR:")) {
        console.error(
          "[API/IP] IP detection script reported error:",
          ipContent
        );
        controller.error(new Error(ipContent)); // Signal error to client
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
        // Keep the file with error for inspection, don't delete yet
      } else if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ipContent)) {
        // Basic IP format check
        controller.enqueue(`event: ip_detected\ndata: ${ipContent}\n\n`);
        console.log("[API/IP] Sent IP address to client via SSE.");
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
        // Optional: Delete the file now that IP has been sent?
        // try { fs.unlinkSync(IP_FILE_PATH); } catch {}
      } else {
        console.warn(`[API/IP] IP file contains invalid content: ${ipContent}`);
        // Continue polling
      }
    } catch (err) {
      console.error("[API/IP] Error reading IP file:", err);
      // Continue polling
    }
  } else {
    console.log("[API/IP] IP file not found yet.");
    // Keep polling
  }
}

export async function GET(request: Request) {
  const stream = new ReadableStream({
    start(controller) {
      console.log("[API/IP] SSE connection started. Checking for IP file...");

      // Immediately check if file exists
      checkIpFile(controller);

      // If not found immediately, start polling
      if (!intervalId) {
        intervalId = setInterval(() => {
          checkIpFile(controller);
        }, 2000); // Check every 2 seconds
      }
    },
    cancel() {
      console.log("[API/IP] SSE connection closed by client.");
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log("[API/IP] Stopped polling for IP file.");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
