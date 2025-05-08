import React, { useRef, useState, useEffect } from "react";
import { useDropdown } from "../utils/useDropdown";
import { DateTime } from "luxon"; // Import Luxon

export default function SummarizedReport({
  selectedPeriod,
  setSelectedPeriod,
  allMetrics,
  selectedMetrics,
  toggleMetric,
  showPeriodSelector = true,
  showMetricsDropdown = true,
  showMetricsCards = true,
  showHeader = true,
}) {
  const [showDropdown, setShowDropdown, dropdownRef] = useDropdown(false);
  const [peakHours, setPeakHours] = useState({
    Daily: "N/A",
    Weekly: "N/A",
    Monthly: "N/A",
  });

  // Function to subtract 8 hours from a time string
  const adjustTime = (timeStr) => {
    if (timeStr === "N/A" || !timeStr) return "N/A";
    try {
      // Parse the time string (e.g., "5:00 PM") in Asia/Manila timezone
      const dt = DateTime.fromFormat(timeStr, "h:mm a", { zone: "Asia/Manila" });
      if (!dt.isValid) {
        console.error(`Invalid time format: ${timeStr}`);
        return "N/A";
      }
      // Subtract 8 hours and format back to "h:mm a"
      const adjusted = dt.minus({ hours: 8 });
      console.log(`Original time: ${timeStr}, Adjusted time: ${adjusted.toFormat("h:mm a")}`);
      return adjusted.toFormat("h:mm a");
    } catch (error) {
      console.error(`Error adjusting time ${timeStr}:`, error);
      return "N/A";
    }
  };

  // Fetch peak hours when the component mounts
  useEffect(() => {
    const fetchPeakHours = async () => {
      try {
        const fetchUrl = `${process.env.REACT_APP_BACKEND_URL}/api/calendar-events/peak-hours?_=${Date.now()}`;
        console.log(`Fetching from ${fetchUrl}`);
        const response = await fetch(fetchUrl, { cache: "no-store" });
        console.log("Response status:", response.status);
        console.log("Content-Type:", response.headers.get("content-type"));
        const text = await response.text();
        console.log("Raw response:", text);

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Received non-JSON response");
        }

        const data = JSON.parse(text);
        // Adjust times by subtracting 8 hours
        const adjustedData = {
          Daily: adjustTime(data.Daily),
          Weekly: adjustTime(data.Weekly),
          Monthly: adjustTime(data.Monthly),
        };
        console.log("Parsed data:", data);
        console.log("Adjusted peakHours:", adjustedData);
        setPeakHours(adjustedData);
      } catch (error) {
        console.error("Error fetching peak hours:", error.message);
        setPeakHours({ Daily: "N/A", Weekly: "N/A", Monthly: "N/A" });
      }
    };

    fetchPeakHours();
  }, []);

  return (
    <div>
      <div className="flex flex-col space-y-4">
        {showHeader && (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-xl font-bold">Summarized Report</h2>
            <div className="flex flex-wrap gap-2 items-center">
              {showPeriodSelector && (
                <div className="flex gap-2">
                  <div className="flex space-x-0">
                    {["Daily", "Weekly", "Monthly"].map((period, index) => (
                      <button
                        key={period}
                        onClick={() => setSelectedPeriod(period)}
                        className={`px-3 py-1 text-sm transition-colors ${
                          selectedPeriod === period
                            ? "bg-teal-600 text-white hover:bg-teal-800"
                            : "border border-gray-300 hover:bg-gray-300"
                        } ${
                          index === 0
                            ? "rounded-l-md"
                            : index === 2
                            ? "rounded-r-md"
                            : ""
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showMetricsDropdown && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="p-2 hover:bg-gray-100 rounded-full"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-gray-500"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" />
                    </svg>
                  </button>

                  {showDropdown && (
                    <div className="absolute right-0 mt-2 w-48 bg-teal-600 rounded-md shadow-lg py-1 z-10">
                      {allMetrics.map((item, index) => (
                        <div
                          key={index}
                          className={`px-4 py-2 hover:bg-teal-700 flex items-center gap-2 cursor-pointer min-h-[40px] ${
                            index !== allMetrics.length - 1
                              ? "border-b border-white"
                              : ""
                          }`}
                          onClick={() => toggleMetric(item)}
                        >
                          <label className="inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedMetrics.includes(item)}
                              readOnly
                              className="hidden"
                            />
                            <div
                              className="w-4 h-4 bg-white rounded-sm flex items-center justify-center"
                              style={{ border: "1px solid #ccc" }}
                            >
                              <svg
                                className={`w-4 h-4 ${
                                  selectedMetrics.includes(item)
                                    ? "text-teal-700"
                                    : "text-gray-300"
                                }`}
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                {selectedMetrics.includes(item) && (
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                )}
                              </svg>
                            </div>
                          </label>
                          <span className="text-sm text-white">{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showMetricsCards && (
          <div className="flex overflow-x-auto gap-4 pb-4 justify-center">
            {[
              {
                id: "Usage Peak Hour",
                title: "Usage Peak Hours",
                values: peakHours,
                unit: "",
              },
              {
                id: "Total Cleaning Time",
                title: "Total Cleaning Time",
                values: { Daily: "4.5", Weekly: "32", Monthly: "128" },
                unit: "Hours",
              },
              {
                id: "Recommended Cleaning Time",
                title: (
                  <>
                    <span className="text-red-600">Recommended</span>{" "}
                    <span className="text-black">Cleaning</span>
                  </>
                ),
                values: {
                  Daily: "3:00",
                  Weekly: "4:00",
                  Monthly: "2:00",
                },
                unit: "PM",
              },
              {
                id: "Total Resources Restocked",
                title: "Resources Restocked",
                values: { Daily: "30", Weekly: "210", Monthly: "900" },
                unit: "L",
              },
              {
                id: "Recommended Resources",
                title: (
                  <>
                    <span className="text-red-600">Recommended</span>{" "}
                    <span className="text-black">Restock</span>
                  </>
                ),
                values: {
                  Daily: "5:00",
                  Weekly: "3:00",
                  Monthly: "1:00",
                },
                unit: "PM",
              },
            ]
              .filter((card) => selectedMetrics.includes(card.id))
              .map((card, index) => (
                <div
                  key={index}
                  className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 flex-shrink-0 min-w-[200px]"
                >
                  <div className="text-sm font-bold">{card.title}</div>
                  <div className="flex items-baseline mt-1">
                    <span className="text-xl font-semibold">
                      {card.values[selectedPeriod]}
                    </span>
                    <span className="text-gray-500 ml-1">{card.unit}</span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}