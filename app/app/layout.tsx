import "./globals.css";

export const metadata = {
  title: "Telepath — one shared mind",
  description: "What one agent learns, all four know. Supabase Select 2026 Hackathon.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased overflow-x-hidden">
        {/* fondo cinematográfico */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(1100px 550px at 15% -5%, rgba(77,141,255,0.10), transparent 60%), radial-gradient(900px 500px at 85% 10%, rgba(167,139,250,0.10), transparent 60%), radial-gradient(1000px 700px at 50% 110%, rgba(251,191,36,0.06), transparent 60%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)",
              backgroundSize: "34px 34px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />
        </div>
        <div role="note" style={{padding:"8px 16px",textAlign:"center",fontSize:12,background:"#172033",color:"#e2e8f0"}}>Hackathon sandbox · fictional data · local demo responses · do not enter private information</div>
        {children}
      </body>
    </html>
  );
}
