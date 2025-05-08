// src/components/reminder/reminder.js
import React, { useState, useEffect, useCallback } from "react";
import debounce from "lodash/debounce";
import { handleReminderChange } from "../utils/reminderUtils";
import { DateTime } from "luxon";

export default function Reminders({ remindersChecked, setRemindersChecked }) {
  const [alertCount, setAlertCount] = useState(0);
  const [cleaningScheduleCount, setCleaningScheduleCount] = useState(0);
  const [resourceRestockingCount, setResourceRestockingCount] = useState(0);
  const WS_URL = process.env.REACT_APP_BACKEND_URL
    ? process.env.REACT_APP_BACKEND_URL.replace("http", "ws")
    : "ws://localhost:5000";
  const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

  // Debounced function to fetch counts for all event types
  const fetchEventCounts = useCallback(
    debounce(async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          console.warn("No token found in localStorage for event counts API request");
          return;
        }
        const currentDate = DateTime.now().setZone("Asia/Manila").toFormat("yyyy-MM-dd");
        console.log(`Fetching event counts from: ${API_URL}/api/calendar-events/event-counts?date=${currentDate}`);
        const response = await fetch(
          `${API_URL}/api/calendar-events/event-counts?date=${currentDate}`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        console.log("Event counts response status:", response.status);
        if (!response.ok) {
          const text = await response.text();
          console.error("Event counts response body:", text.slice(0, 100));
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Event counts API response:", data);
        setAlertCount(Number(data.Alert || 0));
        setCleaningScheduleCount(Number(data.CleaningSchedule || 0));
        setResourceRestockingCount(Number(data.TimeToRestock || 0));
      } catch (error) {
        console.error("Error fetching event counts:", error);
        setAlertCount(0);
        setCleaningScheduleCount(0);
        setResourceRestockingCount(0);
      }
    }, 500),
    []
  );

  // Fetch initial counts on mount
  useEffect(() => {
    fetchEventCounts();
  }, [fetchEventCounts]);

  // WebSocket for real-time updates
  useEffect(() => {
    let ws;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 3000;
    const initialDelay = 1000;

    const checkServerHealth = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return false;
        const response = await fetch(
          `${API_URL}/api/calendar-events/event-counts?date=${DateTime.now().toFormat("yyyy-MM-dd")}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        return response.ok;
      } catch (error) {
        console.error("Server health check failed:", error);
        return false;
      }
    };

    const connectWebSocket = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        console.warn("No token found in localStorage for WebSocket. Aborting connection.");
        return;
      }

      const isServerHealthy = await checkServerHealth();
      if (!isServerHealthy) {
        console.warn("Server not available. Scheduling reconnect attempt.");
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
          console.log(`Reconnecting attempt ${reconnectAttempts}/${maxReconnectAttempts} in ${delay}ms`);
          setTimeout(connectWebSocket, delay);
        } else {
          console.error("Max reconnect attempts reached. Server unavailable.");
        }
        return;
      }

      const wsUrl = `${WS_URL}?token=${token}`;
      console.log(`Attempting WebSocket connection: ${wsUrl}`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected for Reminders");
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("WebSocket message received:", message);
          if (message.type === "calendarEvent") {
            const { title, classNames, date } = message.data;
            console.log("Processing calendarEvent:", { title, classNames, date });
            const currentDate = DateTime.now().setZone("Asia/Manila").toFormat("yyyy-MM-dd");
            if (date === currentDate) {
              if (title === "Alert!" || title === "Peak Hour") {
                setAlertCount((prev) => {
                  console.log(`Incrementing alertCount from ${prev} to ${prev + 1}`);
                  return prev + 1;
                });
              } else if (title === "Cleaning Schedule") {
                setCleaningScheduleCount((prev) => {
                  console.log(`Incrementing cleaningScheduleCount from ${prev} to ${prev + 1}`);
                  return prev + 1;
                });
              } else if (classNames && classNames.includes("black-event-style")) {
                setResourceRestockingCount((prev) => {
                  console.log(`Incrementing resourceRestockingCount from ${prev} to ${prev + 1}`);
                  return prev + 1;
                });
              } else {
                console.warn("Unrecognized event type:", title, classNames);
              }
            }
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
        if (reconnectAttempts < maxReconnectAttempts && event.code !== 1000) {
          reconnectAttempts++;
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
          console.log(`Reconnecting attempt ${reconnectAttempts}/${maxReconnectAttempts} in ${delay}ms`);
          setTimeout(connectWebSocket, delay);
        } else {
          console.error(
            event.code === 1000
              ? "WebSocket closed normally."
              : "Max reconnect attempts reached. Giving up."
          );
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (error.target && error.target.readyState === WebSocket.CLOSED) {
          console.error("WebSocket closed unexpectedly before connection. ReadyState:", error.target.readyState);
        }
      };
    };

    const timer = setTimeout(connectWebSocket, initialDelay);
    return () => {
      clearTimeout(timer);
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        console.log("Closing WebSocket connection on component unmount");
        ws.close(1000, "Component unmount");
      }
    };
  }, [fetchEventCounts]);

  const handleReminderChangeWrapper = (key) => {
    console.log(`Toggling reminder: ${key}, Current state:`, remindersChecked);
    handleReminderChange(setRemindersChecked, key);
    console.log(`New remindersChecked state:`, { ...remindersChecked, [key]: !remindersChecked[key] });
  };

  return (
    <div className="flex flex-col items-start mt-4 mb-4">
      <h2 className="text-xl font-bold mb-4">Reminders</h2>
      <div className="w-full space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
              <input
                id="blue-checkbox"
                type="checkbox"
                checked={remindersChecked.cleaningSchedule}
                onChange={() => handleReminderChangeWrapper("cleaningSchedule")}
                className="w-4 h-4 text-blue-600 bg-white border-white rounded-sm focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-white focus:ring-2 dark:bg-white dark:border-white"
              />
            </div>
            <span>Cleaning Schedule</span>
          </div>
          <span className="bg-blue-500 text-white text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full">
            {cleaningScheduleCount}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-red-500 rounded flex items-center justify-center">
              <input
                id="red-checkbox"
                type="checkbox"
                checked={remindersChecked.peakHours}
                onChange={() => handleReminderChangeWrapper("peakHours")}
                className="w-4 h-4 text-red-600 bg-white border-red-500 rounded-sm focus:ring-red-500 dark:focus:ring-red-500 dark:ring-offset-white focus:ring-2 dark:bg-white dark:border-white"
              />
            </div>
            <span>Peak Hours</span>
          </div>
          <span className="bg-red-500 text-white text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full">
            {alertCount}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-black rounded flex items-center justify-center">
              <input
                id="black-checkbox"
                type="checkbox"
                checked={remindersChecked.resourceRestocking}
                onChange={() => handleReminderChangeWrapper("resourceRestocking")}
                className="w-4 h-4 text-black bg-white border-white rounded-sm focus:ring-black dark:focus:ring-black dark:ring-offset-white focus:ring-2 dark:bg-white dark:border-white"
              />
            </div>
            <span>Resource Restocking</span>
          </div>
          <span className="bg-black text-white text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full">
            {resourceRestockingCount}
          </span>
        </div>
      </div>
    </div>
  );
}