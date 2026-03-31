"use client"

import { Poppins } from "next/font/google"
import Image from "next/image"

import { FaGithub } from "react-icons/fa"

import { uniqueNamesGenerator, colors, adjectives, animals } from "unique-names-generator";

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button";
import { SparkleIcon } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { ProjectsList } from "./projects-List"

import { useCreateProject } from "../hooks/use-projects";
import { useEffect, useState } from "react";
import { ProjectsCommandDialog } from "./projects-command-dialog";

import { ImportGithubDialog } from "./import-github-dialog";

const font = Poppins({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800", "900"],
})

export const ProjectsView = () => {



    const createProject = useCreateProject();

    const [commandDialogOpen, setCommandDialogOpen] = useState(false)
    const [importDialogOpen, setImportDialogOpen] = useState(false)



  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "k") {
          e.preventDefault();
          setCommandDialogOpen(true);
        }
        if (e.key === "i") {
          e.preventDefault();
          setImportDialogOpen(true);
        }

      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
    return (
        <>
            <ProjectsCommandDialog open={commandDialogOpen} onOpenChange={setCommandDialogOpen} />
            <ImportGithubDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
            <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center p-6 md:p-16">
                <div className="w-full max-w-sm mx-auto flex flex-col gap-4 items-center">

                    <div className="flex justify-center gap-4 w-full items-center ">
                        <div className="flex items-center gap-5 w-full group/logo">
                            <Image src="/logo.svg" alt="NeonScript" width={54} height={54} />
                            <h1 className={cn(
                                "text-4xl md:text-5xl font-semibold ",
                                font.className)}>
                                NeonScript
                            </h1>
                        </div>
                    </div>



                    <div className="flex flex-col gap-4 w-full">
                        <div className="grid grid-cols-2 gap-2">

                            <Button
                                variant={"outline"}
                                onClick={() => {
                                    const projectName = uniqueNamesGenerator({
                                        dictionaries: [adjectives,
                                            animals,
                                            colors],
                                        separator: "-",
                                        length: 3,
                                    })

                                    createProject({
                                        name: projectName,

                                    });

                                }}
                                className="h-full items-center justify-start p-4 bg-background border cursor-pointer
                                          flex flex-col gap-6 rounded-none "
                            >
                                <div className="flex items-center justify-between w-full ">
                                    <SparkleIcon className="size-4 " />
                                    <Kbd className="bg-accent border">
                                        CTRL + J
                                    </Kbd>
                                </div>

                                <div>
                                    <span className="text-sm font-semibold">
                                        NEW
                                    </span>
                                </div>

                            </Button>

                            <Button
                                variant={"outline"}
                                onClick={() => setImportDialogOpen(true)}
                                className="h-full items-center justify-start p-4 bg-background border cursor-pointer
                                          flex flex-col gap-6 rounded-none "
                            >
                                <div className="flex items-center justify-between w-full ">
                                    <FaGithub className="size-4 " />
                                    <Kbd className="bg-accent border">
                                        CTRL + I
                                    </Kbd>
                                </div>

                                <div>
                                    <span className="text-sm font-semibold">
                                        Import
                                    </span>
                                </div>

                            </Button>
                        </div>


                        <ProjectsList onViewAll={() => { setCommandDialogOpen(true) }} />


                    </div>

                </div>
            </div>

        </>
    )
}
