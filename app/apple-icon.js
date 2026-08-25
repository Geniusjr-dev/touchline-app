import { ImageResponse } from "next/og";
import { createElement } from "react";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    createElement(
      "div",
      {
        style: {
          alignItems: "center",
          background: "#090A0B",
          color: "#FF7A45",
          display: "flex",
          fontSize: 112,
          fontWeight: 900,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        },
      },
      "⚡",
    ),
    size,
  );
}
