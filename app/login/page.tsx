"use client"; // For components that need React hooks and browser APIs, SSR (server side rendering) has to be disabled. Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering

import { useRouter } from "next/navigation"; // use NextJS router for navigation
import { useApi } from "@/hooks/useApi";
import { useEffect } from "react";
import { Form, Input, Button } from "antd";
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


  /* 
    NEW LOGIN PAGE
    Warning: Styles still *NEED* to be seperated to external .css file!
  */
  return (
    <>

      <style>
        {`

          @font-face {
           font-family: 'Kranky';
           src: url('/fonts/Kranky.ttf') format('truetype');
           font-weight: normal;
           font-style: normal;
          }

          @font-face {
           font-family: 'Digitalt';
           src: url('/fonts/Digitalt.ttf') format('truetype');
           font-weight: normal;
           font-style: normal;
          }

          @font-face {
           font-family: 'Koulen';
           src: url('/fonts/Koulen.ttf') format('truetype');
           font-weight: normal;
           font-style: normal;
          }

          .ant-form-item-required::before {
            content: "*";
            visibility: hidden;
          }
        `}
      </style>

      <div
        style={{
          height: "100vh",
          overflow: "hidden",
          background: "url('/images/background_new.jpg') no-repeat center center/cover",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "20px",
          fontFamily: "Digitalt"
        }}
      >
        <div
          style={{
            background: "rgba(255, 255, 255, 0.56)",
            borderRadius: "35px",
            padding: "40px",
            maxWidth: "450px",
            width: "100%",
            textAlign: "center",
            boxShadow: "inset 0 0 0 2px rgba(255, 255, 255, 0.69), 0 8px 20px rgba(255, 255, 255, 0.5)",
            backdropFilter: "blur(1px)",
            WebkitBackdropFilter: "blur(10px)"
          }}
        >
          <h1
            style={{
              fontSize: "4rem",
              marginBottom: "-0.1rem",
              color: "#000",
              fontFamily: "'Kranky', serif",
              fontWeight: "normal",
              textShadow: `
                -3px -3px 0 #fff,
               3px -3px 0 #fff,
              -3px  3px 0 #fff,
               3px  3px 0 #fff,
              -3px  0px 0 #fff,
               3px  0px 0 #fff,
               0px -3px 0 #fff,
               0px  3px 0 #fff,
               0    0   3px #fff
                `
            }}
            >
              DRAWZONE
            </h1>
          <p
            style={{
              fontSize: "1.3rem",
              fontWeight: -900,
              marginBottom: "2rem",
              color: "#fff",
              fontFamily: "'Digitalt', serif",
              textShadow: `
                0 -1px 0 #000,
                1px 0 0 #000,
                0 1px 0 #000,
               -1px 0 0 #000,
               -1px -1px 0 #000,
                1px -1px 0 #000,
                1px 1px 0 #000,
               -1px 1px 0 #000
            `
            }}
          >
            ART BATTLE ROYALE
          </p>

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
              label={
                <div style={{ marginBottom: "-15px" }}>
                 <span
                   style={{
                     fontWeight: 500,
                     color: "#000",
                     fontSize: "1.1rem",
                     letterSpacing: "1.4px",
                     fontFamily: "'Digitalt', serif",
                     textTransform: "uppercase"
                   }}
                 >
                    Username:
                  </span>
                </div>
              }
            >
              <Input style={{
                 height: "55px",
                 width: "95%",
                 borderRadius: "8px",
                 backgroundColor: "#fff",
                 border: "1px solid #000",
                 boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.3)",
                 color: "#000"
               }} />
            </Form.Item>

            <Form.Item
              name="password"
              label={
                <div style={{ marginBottom: "-15px" }}>
                 <span
                   style={{
                    fontWeight: 500,
                    color: "#000",
                    fontSize: "1.1rem",
                    letterSpacing: "1.4px",
                    fontFamily: "'Digitalt', serif",
                    textTransform: "uppercase"
                   }}
                 >
                    Password:
                  </span>
                </div>
              }

              rules={[{ required: true, message: "Please enter your password!" }]}
            >
              <Input.Password style={{
                 height: "55px",
                 width: "95%",
                 borderRadius: "8px",
                 backgroundColor: "#fff",
                 border: "1px solid #000",
                 boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.3)",
                 color: "#000"
               }} />
            </Form.Item>
            
          <div style={{ marginTop: "50px" }}>
            <Form.Item style={{ marginBottom: "8px" }}>
              <Button
                type="primary"
                htmlType="submit"
                style={{
                  width: "75%",
                  height: "52px",
                  backgroundColor: "#CBB0FF",
                  borderColor: "#7f5ac5",
                  fontWeight: "bold",
                  fontSize: "1.1rem",
                  letterSpacing: "1.2px",
                  borderRadius: "8px",
                  border: "1px solid #000",
                  boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.3)",
                }}
              >
                <p
            style={{
              fontSize: "1.6rem",
              letterSpacing: "4px",
              fontWeight: 500,
              color: "#000",
              fontFamily: "'Digitalt', serif",
              textShadow: `
                 0 -1px 0 #fff,
                 1px 0 0 #fff,
                 0 1px 0 #fff,
                -1px 0 0 #fff,
                -1px -1px 0 #fff,
                 1px -1px 0 #fff,
                 1px 1px 0 #fff,
                -1px 1px 0 #fff
              `
            }}
          >
            LOGIN
          </p>
              </Button>
            </Form.Item>

            <div style={{ 
              margin: "10px 0", 
              fontWeight: 500,
              fontSize: "1.2rem",
              letterSpacing: "1.3px",
              fontFamily: "'Koulen', serif",
              color: "#000"
            }}
            >OR</div>

            <Form.Item>
              <Button
                type="default"
                onClick={handleRegisterClick}
                style={{
                  width: "58%",
                  backgroundColor: "#444",
                  color: "white",
                  fontWeight: 900,
                  fontSize: "0.8em",
                  letterSpacing: "1px",
                  borderRadius: "8px",
                  marginTop: "1.2px",
                  boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.77), 0 8px 20px rgba(255, 255, 255, 0.5)",
                  border: "1px solid #fff"
                }}
              >
                CREATE AN ACCOUNT
              </Button>
            </Form.Item>
            </div>
          </Form>
        </div>
      </div>
    </>
  );
};

export default Login;
