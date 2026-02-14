import { NextResponse } from "next/server";

export async function POST() {
    throw new Error("Server Error: Something went wrong on the server!");

    return NextResponse.json({ message: "This should not be reached" });
}
