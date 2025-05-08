import React from "react";

function ReminderCard({ date, items }) {
  const getNoteColor = (note) => {
    const lowerNote = (note || "").toLowerCase();
    if (lowerNote.includes("excellent")) {
      return "text-green-600";
    } else if (lowerNote.includes("normal")) {
      return "text-amber-600";
    } else if (lowerNote.includes("abusive")) {
      return "text-red-600";
    }
    return "text-gray-600";
  };

  return (
    <div className="space-y-2">
      <h3 className="font-medium text-gray-500 sticky top-0 bg-white py-2">
        {date}
      </h3>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 p-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-gray-900">{item.janitorName}</p>
                <p className="text-sm text-gray-500">{item.resource}</p>
              </div>
              <span
                className={`text-sm font-medium ${getNoteColor(item.note)}`}
              >
                {item.note || "N/A"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ReminderCard;