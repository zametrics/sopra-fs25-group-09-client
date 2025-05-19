"use client";
import { ReactNode } from "react";
import { SoundProvider } from "@/context/SoundProvider";
import { ConfigProvider, theme } from "antd";
import { AntdRegistry } from "@ant-design/nextjs-registry";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#22426b",
          borderRadius: 8,
          colorText: "#fff",
          fontSize: 16,
          colorBgContainer: "#16181D",
        },
      }}
    >
      <SoundProvider>
        <AntdRegistry>{children}</AntdRegistry>
      </SoundProvider>
    </ConfigProvider>
  );
}
