"use client";
import { useEffect, useState } from "react";

export default function EngineLofi() {
  const [html, setHtml] = useState("");
  useEffect(() => {
    fetch("/lofi-engine.html").then(r => r.text()).then(setHtml);
  }, []);
  if (!html) return <div style={{padding:24}}>Loading...</div>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
