import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "../components/AuthProvider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PaperUWant - AI Research Knowledge Base",
  description: "A lightweight, immersive AI literature knowledge base for researchers and developers",
};

// Custom colored icons via inline SVG
const SuccessIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-green-500">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ErrorIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-red-500">
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6M9 9l6 6" />
  </svg>
);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(0, 0, 0, 0.06)",
              borderRadius: "12px",
              boxShadow: "0 4px 24px rgba(0, 0, 0, 0.08)",
              fontSize: "13px",
              color: "#334155",
            },
            classNames: {
              success: "text-green-600",
              error: "text-red-500",
              loader: "text-blue-400",
            },
          }}
          icons={{
            success: <SuccessIcon />,
            error: <ErrorIcon />,
          }}
        />
        {children}
      </body>
    </html>
  );
}
