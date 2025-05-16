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

  // Handle form submission
  const handleRegister = async (values: {
    username: string;
    password: string;
  }) => {
    try {
      // Send registration request to the backend
      const response = await apiService.post<UserGetDTO>("/users", values);

      // Extract the token from the response (UserGetDTO)
      if (response.token != null) {
        // Store the token in localStorage (as a string)
        const tokenData = { token: response.token };
        localStorage.setItem("token", JSON.stringify(tokenData));
        localStorage.setItem("username", values.username);
        localStorage.setItem("userId", response.id.toString());
      } else {
        throw new Error("Token not found in the response");
      }

      // Redirect to dashboard after successful signup
      router.push("/home");
    } catch (error: unknown) {
      if (error instanceof Error) {
        form.setFields([
          {
            name: "password",
            errors: [error.message],
          },
        ]);
        form.resetFields(["password"]);
        form.resetFields(["username"]);
        alert("Error: " + error.message);
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
            <Input
              prefix={<UserOutlined />}
              className="login-input"
              placeholder="Your username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<label className="login-label">Password:</label>}
            rules={[
              { required: true, message: "Please enter a password" },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve(); // already handled by 'required'

                  if (value.length < 4) {
                    return Promise.reject(
                      "Password must be at least 4 characters long"
                    );
                  }
                  if (value.length > 32) {
                    return Promise.reject(
                      "Password cannot exceed 32 characters"
                    );
                  }
                  if (!/[a-zA-Z]/.test(value)) {
                    return Promise.reject(
                      "Password must contain at least one letter"
                    );
                  }
                  if (!/\d/.test(value)) {
                    return Promise.reject(
                      "Password must contain at least one number"
                    );
                  }
                  if (/\s/.test(value)) {
                    return Promise.reject("Password cannot contain spaces");
                  }

                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              className="login-input"
              placeholder="Your password"
            />
          </Form.Item>

          <div className="login-actions">
            <Form.Item>
              <Button htmlType="submit" className="register-button">
                REGISTER
              </Button>
            </Form.Item>

            <div className="login-divider">OR</div>

            <Form.Item>
              <Button
                onClick={() => router.push("/login")}
                className="redirect-register-button"
              >
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
