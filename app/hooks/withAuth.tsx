import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { User } from "@/types/user"; // TypeScript type for User

const withAuth = <P extends object>(WrappedComponent: React.FC<P>) => {
  const AuthHOC = (props: P) => {
    const router = useRouter();
    const apiService = useApi();
    const storedToken =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    const token = storedToken ? JSON.parse(storedToken)?.token : null;
    const userId =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;

    const [isAllowed, setIsAllowed] = useState<boolean>(false);

    useEffect(() => {
      if (!token || !userId) {
        setIsAllowed(false);
        router.push("/unauthorized?countdown=15");
        return;
      }

      // Fetch user token by ID and compare with stored token
      const verifyUserToken = async () => {
        try {
          const response = await apiService.get<User>(
            `/users/${localStorage.getItem("userId")}`
          );

          if (response.token === token) {
            setIsAllowed(true);
          } else {
            setIsAllowed(false);
            router.push("/unauthorized?countdown=15");
          }
        } catch (error) {
          console.error("Authentication error:", error);
          setIsAllowed(false);
          router.push("/unauthorized?countdown=15");
        }
      };

      verifyUserToken();
    }, [token, userId, router, apiService]);

    if (!isAllowed) return null;

    return <WrappedComponent {...props} />;
  };

  AuthHOC.displayName = `withAuth(${
    WrappedComponent.displayName || WrappedComponent.name
  })`;

  return AuthHOC;
};

export default withAuth;
