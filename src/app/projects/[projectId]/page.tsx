import { Id } from "../../../../convex/_generated/dataModel";
import { ProjectIdView } from "@/features/projects/components/Project-id-View";

const ProjectIdPage = async ({params}:{params:Promise<{projectId:Id<"projects">}>})=>{

    const {projectId} = await params;

    return (
        <>
        <ProjectIdView projectId={projectId}/>
        
        </>
    )
}

export default ProjectIdPage;
