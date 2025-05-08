import { useEffect, useState, useCallback, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import axios from "axios";
import debounce from "lodash/debounce";
import { DateTime } from "luxon";
import "../../styles/Calendar.css";

const CalendarComponent = ({ remindersChecked, selectedDate }) => {
  const [peakHourEvents, setPeakHourEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState("dayGridMonth");
  const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
  const WS_URL = process.env.REACT_APP_BACKEND_URL
    ? process.env.REACT_APP_BACKEND_URL.replace("http", "ws")
    : "ws://localhost:5000";

  console.log("CalendarComponent: Received props:", { remindersChecked, selectedDate });

  const fetchPeakHourEvents = useCallback(
    debounce(async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          `${API_URL}/api/predictions-occupancy/events`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        const normalizedEvents = response.data.map((event) => ({
          ...event,
          title: event.title || "Alert!",
          classNames: event.classNames || ["red-event-style"],
          type: "peak",
          assignedName: event.assignedName || "Peak Hour",
          start: new Date(event.start), // Ensure date is parsed
          end: event.end ? new Date(event.end) : null,
        }));
        console.log("Normalized peak hour events:", normalizedEvents);
        setPeakHourEvents(normalizedEvents);
      } catch (error) {
        console.error("Error fetching peak hour events:", error);
        setPeakHourEvents([]);
      } finally {
        setLoading(false);
      }
    }, 500),
    []
  );

  useEffect(() => {
    fetchPeakHourEvents();
  }, [fetchPeakHourEvents]);

  useEffect(() => {
    const ws = new WebSocket(
      `${WS_URL}?token=${localStorage.getItem("token")}`
    );

    ws.onopen = () => {
      console.log("WebSocket connected for Calendar");
    };

    ws.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      console.log("WebSocket message for Calendar:", notification);
      if (notification.type === "peak") {
        console.log("Peak notification received, refetching events:", notification);
        fetchPeakHourEvents();
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected for Calendar");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error for Calendar:", error);
    };

    return () => {
      ws.close();
    };
  }, [fetchPeakHourEvents]);

  const handleDateClick = (arg) => {
    alert(`Date: ${arg.dateStr}`);
  };

  const handleEventDrop = (info) => {
    alert(`Event dropped on: ${info.event.start}`);
  };

  const handleViewChange = (dateInfo) => {
    setCurrentView(dateInfo.view.type);
  };

  const renderDayCell = (arg) => {
    const today = new Date();
    const cellDate = arg.date;
    if (
      cellDate.getDate() === today.getDate() &&
      cellDate.getMonth() === today.getMonth() &&
      cellDate.getFullYear() === today.getFullYear()
    ) {
      if (arg.view.type !== "timeGridDay") {
        arg.el.style.backgroundColor = "lightgray";
      } else {
        arg.el.style.backgroundColor = "";
        arg.el.classList.remove("fc-day-today");
        arg.el.style.border = "";
      }
    }
    if (arg.view.type !== "timeGridDay") {
      arg.el.style.border = "1px solid rgba(226, 226, 226, 0.4)";
    } else {
      arg.el.style.border = "";
    }
  };

  useEffect(() => {
    const buttonGroup = document.querySelector(".fc-button-group");
    if (buttonGroup) {
      const buttons = buttonGroup.querySelectorAll(".fc-button");
      buttons.forEach((button) => {
        button.addEventListener("click", () => {
          buttons.forEach((btn) => btn.classList.remove("no-border"));
          button.classList.add("no-border");
        });
      });
    }
  }, []);

  const staticEvents = [
    {
      id: "1",
      title: "Time to Restock",
      assignedName: "Low Detergent",
      start: DateTime.fromISO("2025-02-06T11:30:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-06T12:00:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["black-event-style"],
      type: "schedule",
    },
    {
      id: "2",
      title: "Cleaning Schedule",
      assignedName: "Jane Smith",
      start: DateTime.fromISO("2025-02-06T14:00:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-06T14:30:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["blue-event-style"],
      type: "schedule",
    },
    {
      id: "3",
      title: "Cleaning Schedule",
      assignedName: "Alice Johnson",
      start: DateTime.fromISO("2025-02-07T10:00:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["blue-event-style"],
      type: "schedule",
    },
    {
      id: "4",
      title: "Alert!",
      assignedName: "Peak Hour",
      start: DateTime.fromISO("2025-02-06T10:00:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-06T10:30:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["red-event-style"],
      type: "peak",
    },
    {
      id: "5",
      title: "Alert!",
      assignedName: "Peak Hour",
      start: DateTime.fromISO("2025-02-04T08:00:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-04T09:30:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["red-event-style"],
      type: "peak",
    },
    {
      id: "6",
      title: "Time to Restock",
      assignedName: "Low Bleach",
      start: DateTime.fromISO("2025-02-06T13:30:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-06T14:00:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["black-event-style"],
      type: "schedule",
    },
  ];

  const filteredEvents = useMemo(() => {
    console.log("Computing filteredEvents with:", { remindersChecked, selectedDate });

    // Convert selectedDate to DateTime for comparison, default to null if not provided
    const selectedDateTime = selectedDate
      ? DateTime.fromJSDate(new Date(selectedDate), { zone: "Asia/Manila" }).startOf("day")
      : null;

    const events = [
      ...staticEvents,
      ...peakHourEvents,
    ].filter((event) => {
      // Only filter by date if selectedDateTime is provided
      let isDateMatch = true;
      if (selectedDateTime) {
        const eventDate = DateTime.fromJSDate(new Date(event.start), { zone: "Asia/Manila" }).startOf("day");
        isDateMatch = eventDate.hasSame(selectedDateTime, "day");
      }

      // Set visibility based on classNames or title and remindersChecked
      const isVisible =
        (event.title === "Cleaning Schedule" && remindersChecked.cleaningSchedule) ||
        ((event.title === "Alert!" || event.title === "Peak Hour") && remindersChecked.peakHours) ||
        (event.classNames && event.classNames.includes("black-event-style") && remindersChecked.resourceRestocking);

      console.log(
        `Event: ${event.title}, Type: ${event.type}, Date: ${event.start.toISOString()}, Selected: ${
          selectedDateTime ? selectedDateTime.toISODate() : "All"
        }, DateMatch: ${isDateMatch}, Visible: ${isVisible}`
      );

      return isDateMatch && isVisible;
    });

    console.log("Filtered events:", events);
    return events;
  }, [peakHourEvents, remindersChecked, selectedDate]);

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin, timeGridPlugin, listPlugin]}
        initialView="dayGridMonth"
        initialDate={selectedDate || new Date()}
        editable={true}
        height="auto"
        width="100%"
        headerToolbar={{
          left: "prev,next",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
        }}
        timeZone="Asia/Manila"
        slotDuration="00:15:00"
        slotLabelInterval="00:30:00"
        slotMinTime="07:00:00"
        slotMaxTime="20:00:00"
        allDaySlot={true}
        datesSet={handleViewChange}
        views={{
          dayGridMonth: {
            buttonText: "Month",
            dayCellDidMount: renderDayCell,
            dayHeaderContent: ({ date }) => {
              const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thurs", "Fri", "Sat"];
              const dayName = daysOfWeek[date.getDay()];
              return `${dayName}`;
            },
          },
          timeGridWeek: {
            buttonText: "Week",
            slotDuration: "00:15:00",
            slotLabelInterval: "01:00:00",
            dayCellDidMount: renderDayCell,
            dayHeaderContent: ({ date }) => {
              const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thurs", "Fri", "Sat"];
              const dayName = daysOfWeek[date.getDay()];
              const numericDate = date.getDate();
              const today = new Date();
              const isToday =
                date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear();
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <div>{dayName}</div>
                  {isToday ? (
                    <div
                      style={{
                        display: "inline-block",
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        backgroundColor: "#0044CC",
                        color: "white",
                        textAlign: "center",
                        lineHeight: "24px",
                      }}
                    >
                      {numericDate}
                    </div>
                  ) : (
                    <div>{numericDate}</div>
                  )}
                </div>
              );
            },
            slotLabelFormat: {
              hour: "numeric",
              minute: "2-digit",
              meridiem: "short",
              hour12: true,
            },
          },
          timeGridDay: {
            buttonText: "Day",
            slotDuration: "00:15:00",
            slotLabelInterval: "01:00:00",
            dayCellDidMount: renderDayCell,
            dayHeaderContent: ({ date }) => {
              const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thurs", "Fri", "Sat"];
              const dayName = daysOfWeek[date.getDay()];
              const numericDate = date.getDate();
              const today = new Date();
              const isToday =
                date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear();
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <div>{dayName}</div>
                  {isToday ? (
                    <div
                      style={{
                        display: "inline-block",
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        backgroundColor: "#0044CC",
                        color: "white",
                        textAlign: "center",
                        lineHeight: "24px",
                      }}
                    >
                      {numericDate}
                    </div>
                  ) : (
                    <div>{numericDate}</div>
                  )}
                </div>
              );
            },
            slotLabelFormat: {
              hour: "numeric",
              minute: "2-digit",
              meridiem: "short",
              hour12: true,
            },
          },
          listWeek: {
            buttonText: "List",
            listDayFormat: {
              weekday: "long",
              month: "long",
              day: "numeric",
            },
            listDaySideFormat: false,
          },
        }}
        dateClick={handleDateClick}
        eventDrop={handleEventDrop}
        events={filteredEvents}
        eventContent={(arg) => {
          const { title, extendedProps, start } = arg.event;
          const assignedName = extendedProps.assignedName || "Unassigned";

          const startTime = start
            ? (() => {
                const originalDateTime = DateTime.fromJSDate(start, { zone: "Asia/Manila" });
                // Adjust time by -8 hours
                let adjustedTime = originalDateTime.minus({ hours: 8 });
                // If the adjustment changes the date, force it back to the original date
                if (!adjustedTime.hasSame(originalDateTime, "day")) {
                  adjustedTime = adjustedTime.set({
                    year: originalDateTime.year,
                    month: originalDateTime.month,
                    day: originalDateTime.day,
                  });
                  // Since we're forcing the date, handle the 24-hour wraparound
                  adjustedTime = adjustedTime.plus({ hours: 24 });
                }
                return adjustedTime.toLocaleString({
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });
              })()
            : "No Start Time";

          console.log(
            `Rendering event: ${title}, Start: ${startTime}, Date: ${start?.toISOString()}, Type: ${extendedProps.type || "none"}`
          );

          if (arg.view.type === "listWeek") {
            return (
              <div className="list-event-container">
                <div className="list-event-time">{startTime}</div>
                <div className="list-event-details">
                  <div className="list-event-title">{title}</div>
                  <div className="list-event-assigned">{assignedName}</div>
                </div>
              </div>
            );
          }

          return (
            <div className="custom-event">
              <div className="event-title">{title}</div>
              <div className="event-assigned-name">{assignedName}</div>
              <div className="event-time">{startTime}</div>
            </div>
          );
        }}
      />
    </div>
  );
};

export default CalendarComponent;