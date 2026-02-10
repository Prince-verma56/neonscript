"use client"
import React from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from "../../convex/_generated/api"
import { Button } from '@/components/ui/button'


function page() {

  const projects = useQuery(api.projects.get)
  const createProject = useMutation(api.projects.create)


  return (
    <>
      <div className='flex flex-col gap-2 p-4'>
        <Button onClick={() => createProject({ name: "New Project" })}>
          Add new
        </Button>
        {projects?.map((project) => (
          <div className='border rounded p-2 flex flex-col'
            key={project._id}>
            <h1>{project.name}</h1>
            <h1>Owner ID:{project.ownerId}</h1>
          </div>


        ))}
      </div>

    </>
  )
}

export default page