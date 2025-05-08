import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon, UserIcon } from "@heroicons/react/solid";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

// Singleton WebSocket instance
let wsSingleton = null;

// Custom CSS for smooth toast animations
const toastStyles = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(100px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(100px); }
  }
  .toast-enter { animation: slideIn 400ms ease-in-out forwards; }
  .toast-exit { animation: slideOut 400ms ease-in-out forwards; }
`;
const styleSheet = document.createElement("style");
styleSheet.textContent = toastStyles;
document.head.appendChild(styleSheet);

const NotificationDropdown = ({
  isDropdownVisible,
  setIsDropdownVisible,
  dropdownRef,
  userRole,
  userId,
  token,
  notifications,
  setNotifications,
  unreadCount,
  setUnreadCount,
  setActive,
  notificationsEnabled,
  onBellClick,
}) => {
  const [loading, setLoading] = useState(false);
  const [notificationToasts, setNotificationToasts] = useState([]);
  const backendUrl = process.env.REACT_APP_BACKEND_URL || "https://smart-cubicle-backend.onrender.com";
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const processedIds = useRef(new Set());

  // Helper function to format notifications
  const formatPeakHourMessage = (message, type, notificationPeriod) => {
    if (type === "peak" || message.includes("Peak usage hour changed") || message.includes("Predicted peak hour")) {
      const hourMatch = message.match(/(\d+):00/);
      const periodMatch = message.match(/(Morning|Afternoon|Evening)/i);
      if (!hourMatch || !periodMatch) {
        console.warn(`Invalid peak notification format: message=${message}`);
        return { dropdownMessage: message, toastMessage: message };
      }
      const hour = parseInt(hourMatch[1], 10);
      const period = periodMatch[1];
      const periodFormatted = period.charAt(0).toUpperCase() + period.slice(1).toLowerCase();
      const periodTime = hour >= 12 ? "PM" : "AM";
      const formattedHour = hour % 12 === 0 ? 12 : hour % 12;
      const timeString = `${formattedHour}:00 ${periodTime}`;
      return {
        dropdownMessage: `ALERT!\nPeak Hour detected at ${timeString}`,
        toastMessage: `ALERT! New Peak Usage Detected in ${periodFormatted}`,
      };
    } else if (type === "schedule") {
      const timeMatch = message.match(/(\d+ [AP]M)/i);
      const timeString = timeMatch ? timeMatch[1] : notificationPeriod || "Unknown time";
      return {
        dropdownMessage: `New Schedule!\n${message}`,
        toastMessage: `New Cleaning Schedule at ${timeString}`,
      };
    } else if (type === "restock") {
      const timeMatch = message.match(/"(\d+ [AP]M)"/i);
      const timeString = timeMatch ? timeMatch[1] : "Unknown time";
      return {
        dropdownMessage: `Restock Alert!\n${message}`,
        toastMessage: `Restock Needed at ${timeString}`,
      };
    }
    console.warn(`Unexpected notification type or message: type=${type}, message=${message}`);
    return { dropdownMessage: message, toastMessage: message };
  };

  // Helper function to render notification message
  const renderNotificationMessage = (message, type, notificationPeriod) => {
    const { dropdownMessage } = formatPeakHourMessage(message, type, notificationPeriod);
    const isPeak = type === "peak" || message.includes("Peak usage hour changed") || message.includes("Predicted peak hour");
    const isSchedule = type === "schedule";
    const isRestock = type === "restock";
    const textColor = isPeak ? "#C41D39" : isSchedule ? "#0044CC" : isRestock ? "#FFFFFF" : "#333";
    if (!dropdownMessage.includes("\n")) {
      return <span className="text-sm font-semibold" style={{ color: textColor }}>{dropdownMessage}</span>;
    }
    const [alert, detail] = dropdownMessage.split("\n");
    return (
      <div className="flex flex-col">
        <span className="text-sm font-semibold" style={{ color: textColor }}>{alert}</span>
        <span className="text-sm" style={{ color: textColor }}>{detail}</span>
      </div>
    );
  };

  // Helper function to format date safely
  const formatDate = (date) => {
    if (!date || isNaN(new Date(date).getTime())) {
      console.warn(`Invalid date received: ${date}`);
      return "Unknown time";
    }
    return new Date(date).toLocaleString();
  };

  // Update isMobile on window resize
  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth < 768;
      setIsMobile(newIsMobile);
      console.log(`Screen size changed. Is mobile: ${newIsMobile}, Width: ${window.innerWidth}px`);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch initial notifications
  const fetchInitialNotifications = async () => {
    if (!notificationsEnabled) {
      console.log("Notifications disabled, skipping fetch");
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    try {
      console.log("Fetching initial notifications for role:", userRole, "userId:", userId);
      const response = await fetch(`${backendUrl}/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      console.log("Initial notifications fetched:", data);

      // Filter notifications for Janitors
      const filteredNotifications = data.filter((notif) => {
        if ((notif.type === "schedule" || notif.type === "restock") && userRole === "Janitor" && notif.userId !== userId && notif.recipientId !== userId) {
          console.log(`Skipping ${notif.type} notification ${notif._id} for Janitor with userId ${userId}`);
          return false;
        }
        return true;
      });

      // Set notifications (already sorted by createdAt descending from backend)
      setNotifications(filteredNotifications);
      setUnreadCount(filteredNotifications.filter((notif) => !notif.read).length);
      filteredNotifications.forEach((notif) => processedIds.current.add(notif._id));
    } catch (error) {
      console.error("Error fetching initial notifications:", error.message);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (["Admin", "Superadmin", "Janitor"].includes(userRole)) {
      fetchInitialNotifications();
    }
  }, [userRole, notificationsEnabled, token, userId]);

  // WebSocket setup
  useEffect(() => {
    if (!notificationsEnabled || !["Admin", "Superadmin", "Janitor"].includes(userRole)) {
      console.log("Notifications disabled or invalid role:", userRole);
      setNotifications([]);
      setUnreadCount(0);
      setNotificationToasts([]);
      processedIds.current.clear();
      if (wsSingleton) {
        wsSingleton.close();
        wsSingleton = null;
      }
      return;
    }

    if (!wsSingleton) {
      console.log("Initializing WebSocket connection for role:", userRole);
      const wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
      const wsUrl = `${wsProtocol}${backendUrl.split("://")[1]}/?token=${token}`;
      wsSingleton = new WebSocket(wsUrl);

      wsSingleton.onopen = () => console.log("WebSocket connected for role:", userRole);

      wsSingleton.onmessage = (event) => {
        console.log("WebSocket message received:", event.data);
        let newNotification;
        try {
          newNotification = JSON.parse(event.data);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error.message);
          return;
        }
        console.log("Parsed notification:", newNotification);

        // Validate notification
        if (!newNotification._id || !newNotification.message || !newNotification.type) {
          console.error("Invalid notification received:", newNotification);
          return;
        }
        if (!newNotification.createdAt || isNaN(new Date(newNotification.createdAt).getTime())) {
          console.warn(`Notification ${newNotification._id} has invalid createdAt: ${newNotification.createdAt}`);
          newNotification.createdAt = new Date().toISOString();
        }

        // Filter schedule and restock notifications for Janitors
        if ((newNotification.type === "schedule" || newNotification.type === "restock") && userRole === "Janitor" && newNotification.userId !== userId && newNotification.recipientId !== userId) {
          console.log(`Skipping ${newNotification.type} notification ${newNotification._id} for Janitor with userId ${userId}`);
          return;
        }

        if (processedIds.current.has(newNotification._id)) {
          console.log(`Duplicate notification skipped: ${newNotification._id}`);
          return;
        }
        processedIds.current.add(newNotification._id);

        // Prepend new notification
        setNotifications((prev) => {
          if (prev.some((n) => n._id === newNotification._id)) {
            console.log(`Notification ${newNotification._id} already in list, skipping update`);
            return prev;
          }
          const updatedNotifications = [newNotification, ...prev].slice(0, 10);
          setUnreadCount(updatedNotifications.filter((n) => !n.read).length);
          console.log("Updated notifications:", updatedNotifications);
          return updatedNotifications;
        });

        // Show toast for unread notifications
        if (!newNotification.read) {
          setNotificationToasts((prev) => {
            if (prev.some((t) => t.id === newNotification._id)) {
              console.log(`Toast for ${newNotification._id} already exists, skipping`);
              return prev;
            }
            const toastId = newNotification._id;
            const { toastMessage } = formatPeakHourMessage(newNotification.message, newNotification.type, newNotification.period);
            const newToast = { id: toastId, message: toastMessage, open: true, type: newNotification.type };
            console.log(`Adding toast for notification ${toastId}: ${toastMessage}`);
            setTimeout(() => {
              setNotificationToasts((current) =>
                current.map((t) => (t.id === toastId ? { ...t, open: false } : t))
              );
              setTimeout(() => {
                setNotificationToasts((current) => current.filter((t) => t.id !== toastId));
                console.log(`Toast ${toastId} removed`);
              }, 400);
            }, 2000);
            return [...prev, newToast];
          });
        }
      };

      wsSingleton.onerror = (error) => console.error("WebSocket error:", error);
      wsSingleton.onclose = () => {
        console.log("WebSocket connection closed");
        wsSingleton = null;
      };
    }

    return () => {
      if (wsSingleton) {
        wsSingleton.close();
        wsSingleton = null;
        console.log("WebSocket connection closed on component unmount");
      }
    };
  }, [notificationsEnabled, userRole, userId, token, backendUrl]);

  // Mark all notifications as read
  const markAsRead = async () => {
    if (!notificationsEnabled) return;
    try {
      console.log("Marking all notifications as read for role:", userRole);
      const response = await fetch(`${backendUrl}/notifications/mark-read`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`Failed to mark as read: ${response.status}`);
      setNotifications((prev) => prev.map((notif) => ({ ...notif, read: true })));
      setUnreadCount(0);
      console.log("All notifications marked as read");
    } catch (error) {
      console.error("Error marking notifications as read:", error.message);
    }
  };

  // Clear all notifications
  const clearAll = async () => {
    if (!notificationsEnabled) return;
    try {
      console.log("Clearing all notifications for role:", userRole);
      const response = await fetch(`${backendUrl}/notifications/clear`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`Failed to clear notifications: ${response.status}`);
      setNotifications([]);
      setUnreadCount(0);
      setNotificationToasts([]);
      processedIds.current.clear();
      console.log("All notifications cleared");
      setNotificationToasts((prev) => [
        ...prev,
        {
          id: `success-${Date.now()}`,
          message: "Notifications cleared successfully",
          open: true,
          type: "success",
        },
      ]);
    } catch (error) {
      console.error("Error clearing notifications:", error.message);
    }
  };

  // Mark individual notification as read
  const markNotificationAsRead = async (notificationId) => {
    if (!notificationsEnabled) return;
    try {
      const notification = notifications.find((n) => n._id === notificationId);
      if (!notification) {
        console.log("Notification not found:", notificationId);
        return;
      }
      console.log("Processing notification:", JSON.stringify(notification, null, 2));
      if (notification.type === "new_user" || notification.message.includes("New User")) {
        console.log("Navigating to /users for new_user notification");
        setActive("Users");
        navigate("/users");
        setIsDropdownVisible(false);
      } else if (notification.type === "peak") {
        console.log("Navigating to /usage-monitor for peak notification");
        setActive("Usage Monitor");
        navigate("/usage-monitor");
        setIsDropdownVisible(false);
      } else if (notification.type === "schedule") {
        console.log("Navigating to /janitors for schedule notification");
        setActive("Janitors");
        navigate("/janitors");
        setIsDropdownVisible(false);
      } else if (notification.type === "restock") {
        console.log("Navigating to /inventory for restock notification");
        setActive("Inventory");
        navigate("/inventory");
        setIsDropdownVisible(false);
      } else {
        console.log("No navigation for notification type:", notification.type);
        setIsDropdownVisible(false);
      }
      if (notification.read) {
        console.log("Notification already read:", notificationId);
        return;
      }
      const response = await fetch(`${backendUrl}/notifications/${notificationId}/toggle-read`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ read: true }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to mark notification as read: ${errorText}`);
      }
      const updatedNotifications = notifications.map((notif) =>
        notif._id === notificationId ? { ...notif, read: true } : notif
      );
      setNotifications(updatedNotifications);
      setUnreadCount(updatedNotifications.filter((n) => !n.read).length);
      console.log("Notification marked as read:", notificationId);
    } catch (error) {
      console.error("Error in markNotificationAsRead:", error.message);
      const notification = notifications.find((n) => n._id === notificationId);
      if (notification && (notification.type === "new_user" || notification.message.includes("New User"))) {
        console.log("Retrying navigation to /users due to error");
        navigate("/users");
        setIsDropdownVisible(false);
      }
    }
  };

  // Notification Toast Component
  const NotificationToast = ({ id, message, open, onOpenChange, type }) => (
    <ToastPrimitives.Root
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        "pointer-events-auto relative flex w-full max-w-[380px] items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all",
        type === "schedule" ? "bg-[#f0f4fd]" :
        type === "peak" ? "bg-orange-100" :
        type === "restock" ? "bg-black text-white" :
        message.includes("New Peak Usage Detected") ? "bg-orange-100" :
        message.includes("New User") ? "bg-[#23897D] text-white" :
        message.includes("Notifications cleared successfully") ? "bg-[#23897D] text-white" :
        "bg-gray-200 text-black",
        open ? "toast-enter" : "toast-exit"
      )}
      style={{
        color: type === "schedule" ? "#0044CC" :
               type === "peak" || message.includes("New Peak Usage Detected") ? "#C41D39" :
               type === "restock" ? "#FFFFFF" : undefined,
      }}
    >
      <div className="grid gap-1">
        <ToastPrimitives.Title className="text-sm font-semibold">{message}</ToastPrimitives.Title>
      </div>
      <ToastPrimitives.Close className="absolute right-1 top-1 rounded-md p-1 text-white/50 hover:text-white focus:outline-none focus:ring-1">
        <X className="h-4 w-4" />
      </ToastPrimitives.Close>
    </ToastPrimitives.Root>
  );

  // Notification Toast Viewport
  const NotificationToastViewport = () => (
    <ToastPrimitives.Viewport
      className={cn(
        "fixed z-[100] flex max-h-screen w-full max-w-[380px] flex-col p-4",
        isMobile
          ? "top-20 left-1/2 -translate-x-1/2 -translate-y-1/2"
          : "bottom-10 left-60 m-5"
      )}
    />
  );

  if (!["Admin", "Superadmin", "Janitor"].includes(userRole)) {
    return (
      <div className="relative" ref={dropdownRef}>
        <BellIcon
          className="w-6 h-6 text-gray-600 cursor-pointer hover:text-gray-800 transition-colors duration-300 hover:scale-110"
          onClick={onBellClick}
        />
      </div>
    );
  }

  // Render dropdown for mobile when visible
  if (isMobile && isDropdownVisible) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <button
            className="text-gray-600 hover:text-gray-800"
            onClick={() => setIsDropdownVisible(false)}
          >
            Close
          </button>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <p className="text-xs text-Icpetgreen cursor-pointer" onClick={clearAll}>
            Clear all
          </p>
          <p className="text-xs text-Icpetgreen cursor-pointer" onClick={markAsRead}>
            Mark as read
          </p>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y">
          {loading ? (
            <li className="p-4 text-sm text-gray-500 text-center">Loading...</li>
          ) : notificationsEnabled ? (
            notifications.length > 0 ? (
              notifications.map((notif, index) => (
                <li
                  key={notif._id || index}
                  className={`p-4 flex items-center cursor-pointer hover:bg-gray-300 transition-colors duration-200 ${
                    notif.read
                      ? "bg-white"
                      : notif.message.includes("Peak usage hour changed") || notif.message.includes("Predicted peak hour")
                      ? "bg-orange-100"
                      : notif.message.includes("New User")
                      ? "bg-blue-100"
                      : notif.type === "schedule"
                      ? "bg-[#f0f4fd]"
                      : notif.type === "restock"
                      ? "bg-black text-white"
                      : "bg-gray-200"
                  }`}
                  onClick={() => markNotificationAsRead(notif._id)}
                >
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-gray-600" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    {renderNotificationMessage(notif.message, notif.type, notif.period)}
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(notif.createdAt)}
                    </p>
                  </div>
                </li>
              ))
            ) : (
              <li className="p-4 text-sm text-gray-500 text-center">No notifications</li>
            )
          ) : (
            <li className="p-4 text-sm text-gray-500 text-center">Notifications are disabled</li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <BellIcon
            className="w-6 h-6 text-gray-600 cursor-pointer hover:text-gray-800 transition-colors duration-300 hover:scale-110"
            onClick={onBellClick}
          />
          {unreadCount > 0 && notificationsEnabled && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </div>
        {isDropdownVisible && (
          <>
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-[999] md:hidden"
              onClick={() => setIsDropdownVisible(false)}
            />
            <div className="fixed top-16 left-1/2 transform -translate-x-1/2 w-[90vw] max-w-[280px] md:max-w-[410px] md:absolute md:top-full md:left-auto md:transform-none md:right-0 bg-white shadow-lg rounded-lg py-4 z-[1000] max-h-[500px] overflow-auto">
              <div className="flex items-center justify-between px-4 mb-4">
                <p className="text-xs text-Icpetgreen cursor-pointer" onClick={clearAll}>
                  Clear all
                </p>
                <p className="text-xs text-Icpetgreen cursor-pointer" onClick={markAsRead}>
                  Mark as read
                </p>
              </div>
              <ul className="divide-y">
                {loading ? (
                  <li className="p-4 text-sm text-gray-500 text-center">Loading...</li>
                ) : notificationsEnabled ? (
                  notifications.length > 0 ? (
                    notifications.map((notif, index) => (
                      <li
                        key={notif._id || index}
                        className={`p-4 flex items-center cursor-pointer hover:bg-gray-300 transition-colors duration-200 ${
                          notif.read
                            ? "bg-white"
                            : notif.message.includes("Peak usage hour changed") || notif.message.includes("Predicted peak hour")
                            ? "bg-orange-100"
                            : notif.message.includes("New User")
                            ? "bg-blue-100"
                            : notif.type === "schedule"
                            ? "bg-[#f0f4fd]"
                            : notif.type === "restock"
                            ? "bg-black text-white"
                            : "bg-gray-200"
                        }`}
                        onClick={() => markNotificationAsRead(notif._id)}
                      >
                        <div className="flex-shrink-0 mr-4">
                          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-gray-600" />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          {renderNotificationMessage(notif.message, notif.type, notif.period)}
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDate(notif.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="p-4 text-sm text-gray-500 text-center">No notifications</li>
                  )
                ) : (
                  <li className="p-4 text-sm text-gray-500 text-center">Notifications are disabled</li>
                )}
              </ul>
            </div>
          </>
        )}
      </div>

      <ToastPrimitives.Provider>
        {notificationToasts.map(({ id, message, open, type }) => (
          <NotificationToast
            key={id}
            id={id}
            message={message}
            open={open}
            type={type}
            onOpenChange={(open) => {
              setNotificationToasts((prev) => prev.map((t) => (t.id === id ? { ...t, open } : t)));
              if (!open) {
                setTimeout(() => {
                  setNotificationToasts((prev) => prev.filter((t) => t.id !== id));
                  console.log(`Toast ${id} manually closed and removed`);
                }, 400);
              }
            }}
          />
        ))}
        <NotificationToastViewport />
      </ToastPrimitives.Provider>
    </>
  );
};

export default NotificationDropdown;