"use client";

import dynamic from "next/dynamic";

// This is the magic Next.js function that stops the "Window is not defined" error
const MapComponent = dynamic(() => import("../components/Map"), {
  ssr: false, // ssr = Server-Side Rendering
  loading: () => <div className="flex items-center justify-center h-screen bg-gray-100">Loading Map...</div>,
});

export default function Home() {
  return (
    <main className="h-screen w-screen flex flex-col">
      {/* Header bar */}
      <div className="bg-slate-800 text-white p-4 z-10 shadow-md">
        <h1 className="text-xl font-bold flex items-center gap-2">
          🏔️ Peak & Fog Finder
        </h1>
      </div>

      {/* The actual map area */}
      <div className="flex-grow relative">
        <MapComponent />
      </div>
    </main>
  );
}