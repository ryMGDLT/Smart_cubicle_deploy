import React from "react";
import { QRCodeCanvas } from "qrcode.react";

export default function QRCodeGenerator() {
  const frontendPort = process.env.REACT_APP_FRONTEND_PORT || "3000"; // Fallback to 3000
  const baseUrl =
    process.env.NODE_ENV === "development"
      ? `http://192.168.5.45:${frontendPort}/clean-login`
      : process.env.REACT_APP_PRODUCTION_URL + "/clean-login";

  console.log("QR Code baseUrl:", baseUrl); // Debug log

  return (
    <div className="flex flex-col items-center p-4">
      <h2 className="text-lg font-bold mb-4">Scan to Access Cleaning Login</h2>
      <QRCodeCanvas
        value={baseUrl}
        size={256}
        fgColor="#23897D"
        bgColor="#FFFFFF"
      />
      <p className="mt-4 text-sm">URL: {baseUrl}</p>
    </div>
  );
}