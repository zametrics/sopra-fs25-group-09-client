"use client"; // This ensures React hooks work properly

import React from "react";
import { useRouter } from "next/navigation"; // For navigating after signup
import { useApi } from "@/hooks/useApi"; // API service for making requests
import { Form, Input, Button, Card, Typography } from "antd";// UI components
import { UserOutlined, LockOutlined, IdcardOutlined } from "@ant-design/icons";


interface UserGetDTO {
  id: number;
  name: string;
  username: string;
  status: string;
  token: string;
}

const Register = () => {
  const router = useRouter();
  const apiService = useApi();
  const [form] = Form.useForm();

  // Hook to store token in local storage
  //const { set: setToken } = useLocalStorage<string>("token", "");

  // Handle form submission
  const handleRegister = async (values: { name: string; username: string; password: string }) => {
    try {
      // Send registration request to the backend
      const response = await apiService.post<UserGetDTO>("/users", values); // Ensure the correct DTO type

      // Extract the token from the response (UserGetDTO)
      if (response.token != null) {
        // Store the token in localStorage (as a string)
        const tokenData = { token: response.token }; 
        localStorage.setItem("token", JSON.stringify(tokenData));
        localStorage.setItem("username", values.username); // Store username from input
        localStorage.setItem("userId", response.id.toString());

      } else {
        throw new Error("Token not found in the response");
      }

      // Redirect to dashboard after successful signup
      router.push("/users");
    } catch (error: unknown) {
      if (error instanceof Error) {
        alert(`Something went wrong during registration:\n${error.message}`);
        router.push("/login");
      } else {
        console.error("An unknown error occurred during registration.");
      }
    }
  };

  const { Title } = Typography;

  return (
    <div
    style={{
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh", // Makes the background cover the full viewport
    padding: "2rem",
    background: `url(/images/abstract.jpg) no-repeat center center/cover`, // This uses the image as the background
  }}
    >
      <Card
        style={{
          width: 400,
          padding: "20px",
          borderRadius: "10px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}
      >
        <Title level={2} style={{ marginBottom: "20px" }}>
          Register
        </Title>

        <Form
          form={form}
          onFinish={handleRegister}
          layout="vertical"
          size="large"
        >
          {/* Name Input */}
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter your name" }]}
          >
            <Input
              prefix={<IdcardOutlined />}
              placeholder="Enter your name"
            />
          </Form.Item>

          {/* Username Input */}
          <Form.Item
            name="username"
            label="Username"
            rules={[{ required: true, message: "Please enter a username" }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Enter username"
            />
          </Form.Item>

          {/* Password Input */}
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: "Please enter a password" }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Enter password"
            />
          </Form.Item>

          {/* Submit Button */}
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              style={{
                width: "100%",
                background: "#1890ff",
                border: "none",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              Register
            </Button>
          </Form.Item>
        </Form>

        {/* Already Registered? Login Button */}
        <div style={{ marginTop: "10px", textAlign: "center" }}>
        <p>Already registered?</p>
        <Button type="link" onClick={() => router.push("/login")} style={{ fontSize: "16px" }}>
          Go to Login
        </Button>
        </div>
      </Card>
    </div>
  );
};

export default Register;


