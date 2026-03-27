import { ChevronRightIcon } from "lucide-react";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";
import { useRef, useState } from "react";
import { getItemPadding } from "./constants";

export const CreateInput = ({
    type,
    level,
    onSubmit,
    onCancel

}: {
    type: "file" | "folder",
    level: number,
    onSubmit: (name: string) => void;
    onCancel: () => void;
}) => {

    const [value, setValue] = useState("")
    const isCommittedRef = useRef(false);

    const handleSubmit = () => {
        if (isCommittedRef.current) return;

        const trimmedValue = value.trim();
        if (trimmedValue) {
            isCommittedRef.current = true;
            onSubmit(trimmedValue);
            // setValue("");

        } else {
            isCommittedRef.current = true;
            onCancel();
        }
    }

    const handleCancel = () => {
        if (isCommittedRef.current) return;
        isCommittedRef.current = true;
        onCancel();
    }

    return (


        <>

            <div 
            style={{paddingLeft:getItemPadding(level, type ==="file")}}
            className="w-full flex flex-items gap-1 h-5.5 bg-accent/30">
                <div className="flex items-center gap-0.5">
                    {type === "folder" && (
                        <ChevronRightIcon
                            className="size-4 text-muted-foreground" />

                    )}

                    {type === "file" && (
                        <FileIcon fileName={value} autoAssign
                            className="size-4  " />

                    )}


                    {type === "folder" && (
                        <FolderIcon folderName={value}
                            className="size-4 " />

                    )}

                    <input type="text"
                        autoFocus
                        value={value}
                        onChange={(e => setValue(e.target.value))}
                        className="flex-1 bg-transparent text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-ring "
                        onBlur={handleSubmit}
                        onKeyDown={(e) => {

                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleSubmit();
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                handleCancel();
                            }
                        }}

                    />

                </div>
            </div>
        </>
    )

}
