"use client"; // For components that need React hooks and browser APIs, SSR (server side rendering) has to be disabled. Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering

import { useRouter } from "next/navigation"; // use NextJS router for navigation
import { useApi } from "@/hooks/useApi";
import { useEffect } from "react";
import { Form, Input, Button, Typography } from "antd"; // Import necessary components from Ant Design
import Image from "next/image";

const { Title } = Typography; // Destructure Title component from Typography
// Optionally, you can import a CSS module or file for additional styling:
// import styles from "@/styles/page.module.css";



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
    <div
    style={{
      height: "100vh", // Full viewport height
      overflow: "hidden", // Prevent scrolling
      background: "url('/images/background.jpg') no-repeat center center/cover", // Background image path in the public folder
      backgroundSize: "cover", // Ensures the image covers the entire container
      display: "flex", // Flexbox to align content vertically and horizontally
      flexDirection: "column",
      justifyContent: "center", // Centers content vertically
      alignItems: "center", // Centers content horizontally
      padding: "20px", // Padding to ensure content isn't touching the edges
    }}
    >
    
      {/* Title and Image container */}
      <div
  style={{
    display: "flex", // Use flexbox to align the title and image side by side
    justifyContent: "center", // Centers both elements horizontally
    alignItems: "center", // Centers elements vertically
    marginBottom: "10px", // Adds space between title and form
    marginTop: "150px", // Moves the section down from the top
    background: "rgb(37, 32, 32)", // Background color
    borderRadius: "20px", // This will make the corners rounded, you can adjust the value
    padding: "20px", // Optional: Add some padding inside the container if needed
  }}
      >
        {/* Title */}
        <Title level={2} style={{ marginRight: "20px", marginTop:"20px" }}>SOPRA Project</Title>

        {/* Image on the right */}
        <Image
        src="/images/next-JS-framework.png"
        alt="Login Image"
        width={200}  // Set a fixed width
        height={100} // Set a fixed height
        style={{ borderRadius: "20px" }} 
/>
      </div>

    
    <div className="login-container"
       style={{
        width: "100%", // Full width of its container (you can reduce it to make the form box smaller)
        maxWidth: "400px", // Max width for the form box (you can adjust this value to make it smaller)
        background: "rgba(213, 213, 213, 0)", // Semi-transparent background to make the form stand out
        marginTop: "-325px", // Moves the container 50px from the top (you can adjust this value)

      }}
    >
      
      <Form form={form} name="login" size="large" onFinish={handleLogin} layout="horizontal">
        {/* Username Field */}
        <Form.Item
          name="username"
          label="Username"
          rules={[{ required: true, message: "Please enter your username!" }]}
        >
          <Input placeholder="Enter username" />
        </Form.Item>

        {/* Password Field */}
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: "Please enter your password!" }]}
        >
          <Input.Password placeholder="Enter password" />
        </Form.Item>

        {/* Login Button */}
        <Form.Item>
          <Button type="primary" htmlType="submit" className="login-button">
            Login
          </Button>
        </Form.Item>

        {/* Register Button */}
        <Form.Item>
          <Button type="default" onClick={handleRegisterClick} className="register-button">
            Register
          </Button>
        </Form.Item>
      </Form>
    </div>
    </div>
  );
};

export default Login;
