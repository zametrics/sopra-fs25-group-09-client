"use client"; // For components that need React hooks and browser APIs, SSR (server side rendering) has to be disabled. Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering

import { useRouter } from "next/navigation"; // use NextJS router for navigation
import { useApi } from "@/hooks/useApi";
import { useEffect } from "react";
import { Form, Input, Button } from "antd";
import { UserOutlined, LockOutlined} from "@ant-design/icons";
// import Head from "next/head"; // not needed for this build

const Login: React.FC = () => {
  const router = useRouter();
  const apiService = useApi();
  const [form] = Form.useForm();
  // useLocalStorage hook example use
  // The hook returns an object with the value and two functions
  // Simply choose what you need from the hook:

/*

  const {
    // value: token, // is commented out because we do not need the token value
    set: setToken, // we need this method to set the value of the token to the one we receive from the POST request to the backend server API
    // clear: clearToken, // is commented out because we do not need to clear the token when logging in
  } = useLocalStorage<string>("token", ""); // note that the key we are selecting is "token" and the default value we are setting is an empty string
  // if you want to pick a different token, i.e "usertoken", the line above would look as follows: } = useLocalStorage<string>("usertoken", "");
  
  */

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
        alert("Login failed. Check your username and password.");
      }

        } catch (error) {
      alert("An error occurred while logging in.");
      console.error("Login error:", error);
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
