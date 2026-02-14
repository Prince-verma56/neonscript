"use client"
import React from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from "../../convex/_generated/api"
import { Button } from '@/components/ui/button'
import DemoPage from './demo/page'
import { UserAvatar } from '@clerk/nextjs'


function page() {

  const projects = useQuery(api.projects.get)
  const createProject = useMutation(api.projects.create)



  // 1) CLient Error --> throws in the browser
  const handleClientError = () => {
    throw new Error("Client error : Something went wrong in the browser.!")
  };

  // 2) (API) Server Error --> throws in the server
  const handleServerError = async () => {
    await fetch("/api/demo/error", { method: "POST" });
  };

  // 3) Inggest Error --> throws in the inggest
  const handleInngestError = async () => {
    await fetch("/api/demo/inngest-error", { method: "POST" });
  };

  return (
    <>


<div className='flex flex-col gap-2 p-4'>


  


<UserAvatar />
<DemoPage />


<div className='flex gap-2 justify-center '>
<Button variant={"destructive"} onClick={handleClientError}>Client Error</Button>
<Button variant={"destructive"} onClick={handleServerError}>Server Error</Button>
<Button variant={"destructive"} onClick={handleInngestError}>Inngest Error</Button>
</div>

</div>

    </>
  )
}

export default page