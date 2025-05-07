"use client";
import "@ant-design/v5-patch-for-react-19";
import { useRouter } from "next/navigation";
import { Button } from "antd";

export default function Home() {
  const router = useRouter();
  return (
    <div className="page-background">
      <div>
        <h1 className="drawzone-logo-4rem" style={{ fontSize: 120 }}>
          DRAWZONE
        </h1>
        <h1
          className="drawzone-subtitle-1-5rem"
          style={{ fontSize: 40, textAlign: "center" }}
        >
          ART BATTLE ROYALE
        </h1>
        <div style={{ display: "flex", justifyContent: "center"}}>
          <Button className="Drawzone_button_login login-button" onClick={() => router.push("/login")}>
            LOGIN
          </Button>
        </div>
      </div>
    </div>
  );
}