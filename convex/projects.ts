import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";
import { v } from "convex/values";

export const create = mutation({
    args: {
        name: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await verifyAuth(ctx)
        if (!identity) {
            throw new Error("Not authenticated")
        }


        const projectId = await ctx.db.insert("projects", {
            name: args.name,
            ownerId: identity.subject,
            updatedAt: Date.now(),


        })


        return projectId;

    }
})


export const getPartial = query({
    args: {
        limit: v.number(),
        cursor: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await verifyAuth(ctx);

        const query = await ctx.db
            .query("projects")
            .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject!))
            .order("desc")
            .take(args.limit);

        return query;
    }
})



export const get = query({
    args: {},

    handler: async (ctx) => {
        const identity = await verifyAuth(ctx);

        const query = await ctx.db
            .query("projects")
            .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject!))
            .order("desc")
            .collect()


        return query;
    }
})



export const getById = query({
    args: {
        id: v.id("projects")
    },

    handler: async (ctx,args) => {
        const identity = await verifyAuth(ctx);
        const project = await ctx.db.get('projects',args.id);



        if(!project){
            throw new Error("Project not found")

        }

        if(project.ownerId != identity.subject){
            throw new Error("UnAuthorised acess to this project")
        }

        return project;
       
    }
})
    


export const rename = mutation({
    args: {
        id: v.id("projects"),
        name:v.string(),
    },

    handler: async (ctx,args) => {
        const identity = await verifyAuth(ctx);
        const project = await ctx.db.get('projects',args.id);



        if(!project){
            throw new Error("Project not found")

        }

        if(project.ownerId != identity.subject){
            throw new Error("UnAuthorised acess to this project")
        }

    await ctx.db.patch("projects",args.id,{
        name:args.name,
        updatedAt:Date.now(),
    })
       
    }
})
    

