import { NextResponse } from "next/server";
import { intakeResume } from "@/lib/resumes/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const jobId = String(form.get("jobId") || "");
      const roleTitle = String(form.get("roleTitle") || "");
      const candidateName = String(form.get("candidateName") || "");
      const candidateEmail = String(form.get("candidateEmail") || "");
      const pushToGina = String(form.get("pushToGina") || "true") !== "false";
      const pastedText = String(form.get("resumeText") || "");

      let pdfBuffer: Buffer | undefined;
      let fileName: string | undefined;

      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const blob = file as File;
        fileName = blob.name || "resume.pdf";
        const bytes = Buffer.from(await blob.arrayBuffer());
        if (fileName.toLowerCase().endsWith(".pdf")) {
          pdfBuffer = bytes;
        } else {
          // Treat non-PDF uploads as plain text
          const asText = bytes.toString("utf8");
          const result = await intakeResume({
            jobId: jobId || undefined,
            roleTitle: roleTitle || undefined,
            fileName,
            resumeText: asText,
            candidateName: candidateName || undefined,
            candidateEmail: candidateEmail || undefined,
            pushToGina,
          });
          return NextResponse.json(result, { status: 201 });
        }
      }

      if (!pdfBuffer && !pastedText.trim()) {
        return NextResponse.json(
          { error: "Upload a PDF or paste resume text" },
          { status: 400 },
        );
      }

      const result = await intakeResume({
        jobId: jobId || undefined,
        roleTitle: roleTitle || undefined,
        fileName,
        pdfBuffer,
        resumeText: pastedText || undefined,
        candidateName: candidateName || undefined,
        candidateEmail: candidateEmail || undefined,
        pushToGina,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const body = await request.json().catch(() => ({}));
    const result = await intakeResume({
      jobId: body.jobId,
      roleTitle: body.roleTitle,
      fileName: body.fileName,
      resumeText: body.resumeText,
      candidateName: body.candidateName,
      candidateEmail: body.candidateEmail,
      pushToGina: body.pushToGina,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Resume intake failed" },
      { status: 400 },
    );
  }
}
