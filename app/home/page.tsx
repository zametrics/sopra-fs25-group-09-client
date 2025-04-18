// your code here for S2 to display a single user profile after having clicked on it
// each user has their own slug /[id] (/1, /2, /3, ...) and is displayed using this file
// try to leverage the component library from antd by utilizing "Card" to display the individual user
// import { Card } from "antd"; // similar to /app/users/page.tsx

// this code is part of S2 to display a list of all registered users
// clicking on a user in this list will display /app/users/[id]/page.tsx
"use client"; // For components that need React hooks and browser APIs, SSR (server-side rendering) has to be disabled. Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering

import { Typography } from "antd"; // UI components from Ant Design
import { Form } from "antd"; // Importing the type for table properties

import withAuth from "@/hooks/withAuth"; // Import the authentication wrapper

// Optionally, you can import a CSS module or file for additional styling:
// import "@/styles/views/Dashboard.scss";

const {} = Typography; // Extracting the Title component from Typography for styling

const Dashboard: React.FC = () => {
  const [] = Form.useForm();

  return <></>;
};

export default withAuth(Dashboard);
