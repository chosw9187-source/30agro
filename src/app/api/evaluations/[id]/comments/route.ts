import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleEvaluation } from "@/lib/evaluation-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const evaluation = await getAccessibleEvaluation(id, session.user);
  if (!evaluation) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const comments = await prisma.comment.findMany({
    where: { evaluationId: id },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      authorName: c.author.name,
      authorId: c.authorId,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const evaluation = await getAccessibleEvaluation(id, session.user);
  if (!evaluation) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const text = String(body?.body ?? "").trim();
  if (!text) {
    return Response.json({ error: "empty" }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: { evaluationId: id, authorId: session.user.id, body: text },
    include: { author: true },
  });

  return Response.json({
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      authorName: comment.author.name,
      authorId: comment.authorId,
    },
  });
}
