// localhost:3000/demo

"use client"

import { useState } from "react";
import { Button } from "@/components/ui/button";

import { useAuth } from "@clerk/nextjs";

import * as Sentry from "@sentry/nextjs";

export default function DemoPage() {



  const userId = useAuth();

    const [loading, setLoading] = useState(false)
    const [loadingBackground, setLoadingBackground] = useState(false)

    const handleBlocking = async () => {
        setLoading(true)
        const response = await fetch("/api/demo/blocking", { method: "POST" });
        const data = await response.json();
        console.log(data);
        setLoading(false)
    }




    const handleBackground = async () => {
        setLoading(true)
        const response = await fetch("/api/demo/background", { method: "POST" });
        const data = await response.json();
        console.log(data);
        setLoading(false)
    }



    const handleClientError = ()=>{
        Sentry.logger.info("User Attempting to click on client function ", {userId})
        throw new Error("Client Error: Something went wrong in the browser.!")
    }

    const handleApiError = async () => {
        await fetch("/api/demo/error", { method: "POST" });
    }

    return (
        <div className="p-8 ">
            <h1>demo</h1>
            <Button
                disabled={loading}
                variant={"outline"} onClick={handleBlocking}>
                {loading ? "Loading..." : "Blocking"}
            </Button>


            <Button
                disabled={loadingBackground}
                variant={"outline"} onClick={handleBackground}>
                {loadingBackground ? "Loading..." : "Background"}
            </Button>
        </div>
    )
}