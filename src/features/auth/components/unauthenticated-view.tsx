"use client"



import { ShieldAlertIcon } from "lucide-react"

import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle
} from "@/components/ui/item"
import { SignInButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"




export const UnauthenticatedView = () => {
    return (
        <div className="flex flex-col items-center justify-center h-screen">
            <Item>
                <ItemMedia>
                    <ShieldAlertIcon className="w-16 h-16 text-red-500" />
                </ItemMedia>
                <ItemContent>
                    <ItemTitle>Not Authenticated</ItemTitle>
                    <ItemDescription>Please sign in to continue</ItemDescription>
                </ItemContent>
                <ItemActions>
                    <SignInButton >
                        <Button variant="outline" size="sm">Sign In</Button>
                    </SignInButton>

                </ItemActions>
            </Item>
        </div>
    )
}
