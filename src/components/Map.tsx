"use client";

import { useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents, Circle, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// 1. Updated Interfaces
interface FogPoint {
  lat: number;
  lon: number;
  elevation: number;    // Added this
  valley_score: number; // Added this
  fog_scores: number[];
  fog_top_asl: number[];
  fog_base_asl: number[];
}

interface Peak {
  lat: number;
  lon: number;
  elevation_m: number;
  viewshed_score: number;
}

// --- This is our main control that talks to Modal ---
function WeatherAndPeaksControl() {
  const map = useMap();
  
  // --- FOG STATE ---
  const [isFogLoading, setIsFogLoading] = useState(false);
  const [fogGrid, setFogGrid] = useState<FogPoint[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [currentHourIndex, setCurrentHourIndex] = useState(0);

  // --- PEAK STATE ---
  const [isPeaksLoading, setIsPeaksLoading] = useState(false);
  const [peaks, setPeaks] = useState<Peak[]>([]);

  // --- MAP STATE ---
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => {
      setZoomLevel(map.getZoom());
    },
  });

  // --- FETCH FOG ---
  const fetchFog = async () => {
    setIsFogLoading(true);
    const bounds = map.getBounds();
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL;
      const url = `${baseUrl}/api/find-fog?lat_min=${bounds.getSouth()}&lat_max=${bounds.getNorth()}&lon_min=${bounds.getWest()}&lon_max=${bounds.getEast()}&grid=5&days=3`;

      const response = await fetch(url);
      const data = await response.json();

      setFogGrid(data.data.grid);
      setTimes(data.data.times);
      setCurrentHourIndex(0); 
    } catch (error) {
      console.error("Failed to fetch fog data:", error);
    } finally {
      setIsFogLoading(false);
    }
  };

  // --- FETCH PEAKS ---
  const fetchPeaks = async () => {
    setIsPeaksLoading(true);
    
    const center = map.getCenter();
    const bounds = map.getBounds();
    
    // 1. Calculate the distance from the center to the top-right corner in meters
    const radiusMeters = map.distance(center, bounds.getNorthEast());
    let dynamicRadiusKm = radiusMeters / 1000;
    
    // 2. Cap the maximum radius to prevent backend out-of-memory crashes if zoomed way out
    const MAX_RADIUS_KM = 40; 
    if (dynamicRadiusKm > MAX_RADIUS_KM) {
      console.warn(`Zoomed out too far! Capping search radius at ${MAX_RADIUS_KM}km.`);
      dynamicRadiusKm = MAX_RADIUS_KM;
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL;
      // 3. Pass the dynamic radius directly to your Modal backend!
      const url = `${baseUrl}/api/find-peaks?lat=${center.lat}&lon=${center.lng}&radius=${dynamicRadiusKm}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "success" && data.peaks) {
        // We still keep this filter just to make sure we don't draw peaks just outside the screen edges
        const visiblePeaks = data.peaks.filter((peak: Peak) => 
          bounds.contains([peak.lat, peak.lon])
        );

        if (visiblePeaks.length === 0) {
          alert("No significant peaks found in this specific area. Try panning to a more mountainous region!");
          setPeaks([]); 
        } else {
          setPeaks(visiblePeaks);
          console.log(`⛰️ Found ${visiblePeaks.length} peaks within ${dynamicRadiusKm.toFixed(1)}km`);
        }
      } else {
        console.error("Backend returned an error or unexpected data:", data);
      }
      
    } catch (error) {
      console.error("Failed to fetch peak data:", error);
      alert("Failed to connect to the peak finder. Check your backend!");
    } finally {
      setIsPeaksLoading(false);
    }
  };

  // Helper function for the slider
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { 
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  };

  return (
    <>
      {/* BUTTONS: Now stacked in the top right corner */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-3">
        <button 
          onClick={fetchFog} 
          disabled={isFogLoading} 
          className="bg-blue-600 text-white font-bold px-4 py-3 rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-gray-400 transition-all"
        >
          {isFogLoading ? "Calculating Fog..." : "Find Fog in View"}
        </button>

        <button 
          onClick={fetchPeaks} 
          disabled={isPeaksLoading} 
          className="bg-emerald-600 text-white font-bold px-4 py-3 rounded-lg shadow-lg hover:bg-emerald-700 disabled:bg-gray-400 transition-all"
        >
          {isPeaksLoading ? "Finding Peaks..." : "Find Peaks in View"}
        </button>
      </div>

      {/* TIME SLIDER UI (Only shows up if we have fog data) */}
      {times.length > 0 && (
        <div 
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] bg-white p-4 rounded-xl shadow-xl w-11/12 max-w-lg flex flex-col items-center gap-2"
          onMouseEnter={() => { map.scrollWheelZoom.disable(); map.dragging.disable(); }}
          onMouseLeave={() => { map.scrollWheelZoom.enable(); map.dragging.enable(); }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="text-lg font-bold text-gray-800">
            {formatTime(times[currentHourIndex])}
          </div>
          <input 
            type="range" 
            min="0" max={times.length - 1} value={currentHourIndex} 
            onChange={(e) => setCurrentHourIndex(parseInt(e.target.value))}
            className="w-full cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between w-full text-xs text-gray-500 font-semibold px-1">
            <span>Now</span><span>+72 Hours</span>
          </div>
        </div>
      )}

      {/* DRAW THE FOG */}
      {fogGrid.map((point, index) => {
        const currentFogProb = point.fog_scores[currentHourIndex];
        if (currentFogProb === null || currentFogProb === undefined || currentFogProb < 0.2) return null;

        const dynamicRadius = 3500 * Math.pow(2, 10 - zoomLevel);

        return (
          <Circle
            key={`fog-${index}`}
            center={[point.lat, point.lon]}
            radius={dynamicRadius}
            pathOptions={{
              color: "transparent", fillColor: "#2563eb", fillOpacity: currentFogProb * 0.8,
            }}
          >
            <Popup>
              <strong>Time:</strong> {formatTime(times[currentHourIndex])} <br />
              <strong>Fog Chance:</strong> {(currentFogProb * 100).toFixed(0)}% <br />
              <strong>Valley Score:</strong> {point.valley_score?.toFixed(2)} <br />
              <strong>Elevation:</strong> {point.elevation}m
            </Popup>
          </Circle>
        );
      })}

      {/* DRAW THE PEAKS */}
      {peaks.map((peak, index) => {
        const isTopPeak = index === 0;

        // 1. Find the nearest fog grid point using .reduce() so TypeScript doesn't lose the type
        let nearestFogPoint: FogPoint | null = null;
        
        if (fogGrid && fogGrid.length > 0) {
          nearestFogPoint = fogGrid.reduce((closest: FogPoint, current: FogPoint) => {
            const distClosest = Math.pow(closest.lat - peak.lat, 2) + Math.pow(closest.lon - peak.lon, 2);
            const distCurrent = Math.pow(current.lat - peak.lat, 2) + Math.pow(current.lon - peak.lon, 2);
            return distCurrent < distClosest ? current : closest;
          }, fogGrid[0]); // Pass the first item as the initial value to guarantee type safety
        }

        // 2. Default Status
        let status = { text: "No Fog Data", color: "bg-gray-100 text-gray-500 border border-gray-200" };
        let heightDiffText = "N/A";
        let heightDiffColor = "text-gray-500";
        let showFogDetails = false;

        // 3. Evaluate Fog IF data is loaded
        if (nearestFogPoint) {
          // Force TypeScript to recognize the type just to be absolutely safe
          const safePoint = nearestFogPoint as FogPoint;
          
          const currentFogProb = safePoint.fog_scores?.[currentHourIndex] || 0;
          const currentFogTop = safePoint.fog_top_asl?.[currentHourIndex];
          const currentFogBase = safePoint.fog_base_asl?.[currentHourIndex];

          // If fog chance is low, it's clear
          if (currentFogProb < 0.3) {
            status = { text: "Clear Skies", color: "bg-emerald-100 text-emerald-700" };
          } 
          // If fog chance is high, compare elevations
          else {
            showFogDetails = true;
            
            if (currentFogTop !== null && currentFogTop !== undefined && currentFogTop > 0) {
              if (peak.elevation_m > currentFogTop) {
                status = { text: "Above the Clouds", color: "bg-blue-500 text-white animate-pulse shadow-md" };
                heightDiffText = `+${(peak.elevation_m - currentFogTop).toFixed(0)}m`;
                heightDiffColor = "text-blue-600";
              } else if (currentFogBase !== null && currentFogBase !== undefined && peak.elevation_m < currentFogBase) {
                status = { text: "Below the Fog", color: "bg-gray-200 text-gray-700" };
                heightDiffText = `${(peak.elevation_m - currentFogBase).toFixed(0)}m`;
                heightDiffColor = "text-red-500";
              } else {
                status = { text: "Inside the Fog", color: "bg-gray-600 text-white shadow-inner" };
                heightDiffText = "In Cloud";
                heightDiffColor = "text-gray-600";
              }
            } else {
              status = { text: "Fog Expected", color: "bg-gray-400 text-white" };
              showFogDetails = false; 
            }
          }
        }

        return (
          <CircleMarker
            key={`peak-${index}`}
            center={[peak.lat, peak.lon]}
            radius={isTopPeak ? 10 : 7}
            pathOptions={{
              color: isTopPeak ? "#fbbf24" : "#ffffff",
              weight: isTopPeak ? 3 : 2,
              fillColor: "#ef4444",
              fillOpacity: 1,
            }}
          >
            <Popup minWidth={220}>
              <div className="flex flex-col gap-2 p-1 font-sans">
                {/* Status Badge */}
                <div className={`text-[10px] font-bold uppercase tracking-widest py-1.5 px-2 rounded-md text-center transition-colors ${status.color}`}>
                  {status.text}
                </div>

                {/* Peak Header */}
                <div className="flex items-center justify-between border-b pb-2 mt-1">
                  <span className="text-lg font-bold text-gray-900 leading-none">
                    {isTopPeak ? "🏆 Top Spot" : `Peak #${index + 1}`}
                  </span>
                  <div className="text-right">
                    <div className="text-xs font-bold text-gray-800">{peak.elevation_m.toFixed(0)}m</div>
                    <div className="text-[9px] text-gray-400 uppercase">Elevation</div>
                  </div>
                </div>

                {/* Fog Comparison Info */}
                {showFogDetails && nearestFogPoint && (
                  <div className="bg-gray-50 p-2 rounded-lg flex flex-col gap-1 border border-gray-100">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Fog Top Level:</span>
                      <span className="font-bold">
                        {(nearestFogPoint as FogPoint).fog_top_asl?.[currentHourIndex]?.toFixed(0)}m
                      </span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-gray-200 pt-1 mt-1">
                      <span className="text-gray-500">Peak vs Fog:</span>
                      <span className={`font-bold ${heightDiffColor}`}>{heightDiffText}</span>
                    </div>
                  </div>
                )}

                {/* Viewshed Score */}
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 italic text-[11px]">View Potential</span>
                    <span className="font-mono font-bold text-blue-600">
                      {peak.viewshed_score.toFixed(0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full transition-all duration-500" 
                      style={{ width: `${Math.min(peak.viewshed_score / 10, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Navigation Button (Fixed Maps URL) */}
                <button 
                  onClick={() => window.open(`https://maps.google.com/?q=${peak.lat},${peak.lon}`, '_blank')}
                  className="mt-2 w-full bg-gray-900 text-white text-[11px] py-2 rounded font-semibold hover:bg-black transition-colors"
                >
                  Navigate to Peak
                </button>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

// --- The main Map component ---
export default function Map() {
  const center = [38.4, -122.4] as [number, number]; // Napa Valley

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer center={center} zoom={10} scrollWheelZoom={true} className="w-full h-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <WeatherAndPeaksControl />
      </MapContainer>
    </div>
  );
}