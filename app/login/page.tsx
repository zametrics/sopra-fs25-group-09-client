"use client";

import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useEffect, useState } from "react";
import { Form, Input, Button } from "antd";
import { UserOutlined, LockOutlined, CloseCircleOutlined } from "@ant-design/icons";

// Define interface for error object
interface ApiError {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
  message?: string;
}

const Login: React.FC = () => {
  const router = useRouter();
  const apiService = useApi();
  const [form] = Form.useForm();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check if there's a token in localStorage when the component is mounted
    const token = localStorage.getItem("token");
    
    // If a token exists, redirect to the dashboard
    if (token) {
      router.push("/users");
    }
  }, [router]);

  
  interface LoginFormValues {
    username: string;
    password: string;
  }

  const handleLogin = async (values: LoginFormValues) => {
    // Clear any previous error messages
    setErrorMessage(null);
    
    try {
      // Send the login request with username and password
      const response = await apiService.post<{ success: boolean, token: string, userId: string}>("/login", values);

      // Log the response to check the structure
      console.log(response);  // Check the response structure

      if (response.success) {
        // Store the username in localStorage to keep track of the logged-in user
        const tokenData = { token: response.token };
        localStorage.setItem("token", JSON.stringify(tokenData));
        localStorage.setItem("username", values.username); // Store username from input
        localStorage.setItem("userId", response.userId);

        router.push("/users"); // Redirect to users dashboard
      } else {
        // Set error message instead of alert
        setErrorMessage("Login failed. Check your username and password.");
      }
    } catch (error: unknown) {
      // Handle error cases
      console.error("Login error:", error);
      
      // Type guard to safely work with the error object
      const apiError = error as ApiError;
      
      if (apiError.response && apiError.response.status === 404) {
        setErrorMessage("Account not found. Please check your username or create a new account.");
      } else {
        setErrorMessage("An error occurred while logging in.");
      }
    }
  };

  // Redirect to the Register page
  const handleRegisterClick = () => {
    router.push("/register");
  };

  return (
    <div className="page-background">
      <div className="login-register-box">
        <h1 className="drawzone-logo-4rem">DRAWZONE</h1>
        <p className="drawzone-subtitle-1-3rem">ART BATTLE ROYALE</p>
        
        {/* Error message component */}
        {errorMessage && (
          <div style={{
            backgroundColor: "#ff4d4f",
            color: "white",
            padding: "12px 16px",
            borderRadius: "4px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)"
          }}>
            <CloseCircleOutlined style={{ 
              fontSize: "18px", 
              marginRight: "12px" 
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ 
                fontWeight: "bold", 
                marginBottom: "4px",
                fontSize: "16px" 
              }}>
                Authentication Error
              </div>
              <div style={{ fontSize: "14px" }}>{errorMessage}</div>
            </div>
            <div 
              style={{ 
                cursor: "pointer", 
                fontSize: "16px",
                padding: "4px" 
              }}
              onClick={() => setErrorMessage(null)}
            >
              ✕
            </div>
          </div>
        )}
  
        <Form
          form={form}
          name="login"
          size="large"
          onFinish={handleLogin}
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: "Please enter your username!" }]}
            colon={false}
            label={<label className="login-label">Username:</label>}
          >
            <Input prefix={<UserOutlined />} className="login-input" placeholder="Your username" />
          </Form.Item>
  
          <Form.Item
            name="password"
            rules={[{ required: true, message: "Please enter your password!" }]}
            label={<label className="login-label">Password:</label>}
          >
            <Input.Password prefix={<LockOutlined />} className="login-input" placeholder="Your password" />
          </Form.Item>
  
          <div className="login-actions">
            <Form.Item>
              <Button htmlType="submit" className="login-button">LOGIN</Button>
            </Form.Item>
            <div className="login-divider">OR</div>
            <Form.Item>
              <Button onClick={handleRegisterClick} className="redirect-register-button">CREATE AN ACCOUNT</Button>
            </Form.Item>
          </div>
        </Form>
      </div>
    </div>
  );
};
  
export default Login;