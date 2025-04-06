"use client"; // This ensures React hooks work properly

import React from "react";
import { useRouter } from "next/navigation"; // For navigating after signup
import { useApi } from "@/hooks/useApi"; // API service for making requests
import { Form, Input, Button } from "antd"; // UI components
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import "@/styles/globals.css";

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
  const handleRegister = async (values: { username: string; password: string }) => {
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

  return (
    <div className="page-background">
      <div className="login-register-box">
        <h1 className="drawzone-logo-4rem">DRAWZONE</h1>
        <p className="drawzone-subtitle-1-3rem">ART BATTLE ROYALE</p>

        <Form
          form={form}
          onFinish={handleRegister}
          layout="vertical"
          size="large"
        > 
          <Form.Item
            name="username"
            rules={[{ required: true, message: "Please enter a username" }]}
            label={<label className="login-label">Username:</label>}
          >
            <Input prefix={<UserOutlined />} className="login-input" placeholder="Your username" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: "Please enter a password" }]}
            label={<label className="login-label">Password:</label>}
          >
            <Input.Password prefix={<LockOutlined />} className="login-input" placeholder="Your password" />
          </Form.Item>

          <div className="login-actions">
            <Form.Item>
              <Button htmlType="submit" className="login-button">
                REGISTER
              </Button>
            </Form.Item>

            <div className="login-divider">OR</div>

            <Form.Item>
              <Button onClick={() => router.push("/login")} className="redirect-register-button">
                BACK TO LOGIN
              </Button>
            </Form.Item>
          </div>
        </Form>
      </div>
    </div>
  );
};

export default Register;
