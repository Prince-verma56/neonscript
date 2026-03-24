/*eslint-disable react-hooks/purity */


import { useMutation, useQuery } from "convex/react";



import { api } from "../../../../../../../convex/_generated/api"
import { Id, Doc } from "../../../../../../../convex/_generated/dataModel";
import { useAuth } from "@clerk/nextjs";

export const useProjects = () => {
    return useQuery(api.projects.get);
}
export const useProjectsPartial = (limit: number) => {
    return useQuery(api.projects.getPartial,
        {
            limit,


        }
    );
}



export const useCreatedProject = () => {
    const { userId } = useAuth();

    return useMutation(api.projects.create).withOptimisticUpdate(
        (localStore, args) => {
            const existingProjects = localStore.getQuery(api.projects.getPartial, {
                limit: 6,
            });

            if (existingProjects) {
                const now = Date.now();

                const newProject = {
                    _id: `temp_${now}` as Id<"projects">,
                    _creationTime: now,
                    name: args.name,
                    ownerId: userId || "anonymous",
                    updatedAt: now,
                    importStatus: undefined,
                    exportStatus: undefined,
                    exportRepoUrl: undefined,
                } as Doc<"projects">;


                localStore.setQuery(api.projects.getPartial, { limit: 6 },
                    [
                        newProject,
                        ...existingProjects,
                    ]
                );
            }
        }
    );
}