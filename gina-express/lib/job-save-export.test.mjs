import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveBoardAndCandidateFile } from "./job-save-export.js";
import { candidateFiles } from "./candidate-files.js";

describe("saveBoardAndCandidateFile", () => {
  it("builds a combined packet from board + candidate file", async () => {
    const title = `Export Role ${Date.now()}`;
    const file = await candidateFiles.createFile({
      job: {
        title,
        description: "Hydraulics and preventive maintenance",
        location: "Atlanta, GA",
      },
      clientName: "Test Client",
    });
    await candidateFiles.addCandidate(file.id, {
      name: "File Person",
      email: "file@example.com",
      resumeText: "Warehouse mechanic resume with hydraulics.",
      role: title,
    });

    const result = await saveBoardAndCandidateFile({
      jobTitle: title,
      candidateFileId: file.id,
      boardCandidates: [
        {
          name: "Board Person",
          email: "board@example.com",
          stage: "new",
          resumeText: "Board resume text",
        },
      ],
      pushToTalentPool: false,
      saveLocalArchive: false,
    });

    assert.equal(result.ok, true);
    assert.equal(result.boardCount, 1);
    assert.equal(result.candidateFileCount, 1);
    assert.match(result.text, /BOARD CANDIDATES/);
    assert.match(result.text, /Board Person/);
    assert.match(result.text, /CANDIDATE FILE/);
    assert.match(result.text, /File Person/);
    assert.match(result.filename, /job-save-/);
  });
});
