import { Spinner } from "@/components/ui/spinner"


export const AuthLoadingView = () => {
    return (
        <div className="flex flex-col items-center justify-center h-screen">
            <Spinner />
        </div>
    )
}   