import React, { Suspense } from "react";
import DashboardClient from "./DashboardClient"; // Import the new client component

// Basic Loading Component (can be customized)
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
    <p className="text-gray-600 dark:text-gray-300 text-lg">
      Loading Dashboard...
    </p>
    {/* You could add a spinner here */}
  </div>
);

export default function Page() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DashboardClient />
    </Suspense>
  );
}
