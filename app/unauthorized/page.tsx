"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Typography, Card } from "antd";

const { Title, Text } = Typography;

const Unauthorized = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCountdown = Number(searchParams.get("countdown")) || 3;
  const [countdown, setCountdown] = useState(initialCountdown);
  const [isClient, setIsClient] = useState(false); // State to track if it's client-side

  useEffect(() => {
    // Only run this logic on the client side
    setIsClient(true);

    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const timeout = setTimeout(() => {
      router.push("/login");
    }, initialCountdown * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [router, initialCountdown]);

  if (!isClient) {
    return null; // Prevent rendering on the server side
  }

  const handleLogout = async () => {


    // Clear the token and username from localStorage
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    router.push("/login")
  };


  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "rgba(35, 17, 17, 0.1)",
      }}
    >
      <Card
        style={{
          textAlign: "center",
          padding: "2rem",
          boxShadow: "0 4px 12px rgba(246, 237, 237, 0.1)",
          borderRadius: "10px",
          width: "400px",
        }}
      >
        <Title level={3} style={{ color: "#ff4d4f" }}>
          🚫 Access Denied
        </Title>
        <Text type="secondary" style={{ color: "rgb(255, 255, 255)" }}>
          Only logged-in users can access this page.
        </Text>
        <br />
        <Text strong style={{ color: "rgb(255, 255, 255)" }}>
          Redirecting in {countdown}...
        </Text>
        <br />
        <Button
          type="primary"
          style={{ marginTop: "1rem" }}
          onClick={handleLogout}
        >
          Back to Login
        </Button>
      </Card>
    </div>
  );
};

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Unauthorized />
    </Suspense>
  );
}
