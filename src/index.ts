"#!/usr/bin/env node";
import "dotenv/config";

import { promises as fs } from "fs";
import path from "path";
import { OpenAI } from "openai";
import ignore from "ignore";
import simpleGit from "simple-git";
import { excludeAlways } from "./const";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
    ? process.env.OPENAI_API_KEY
    : (() => {
        throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
      })(),
});

async function isGitRepo(dir: string) {
  const git = simpleGit(dir);
  return git.checkIsRepo();
}

async function loadGitIgnore(dir: string) {
  const ig = ignore();

  ig.add(excludeAlways);

  try {
    const gitignoreContent = await fs.readFile(
      path.join(dir, ".gitignore"),
      "utf8",
    );
    ig.add(gitignoreContent);
  } catch {
    // .gitignore 없으면 무시
  }

  return ig;
}

async function walk(
  dir: string,
  ig: ReturnType<typeof ignore>,
  base = "",
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(base, entry.name);

    if (ig.ignores(relativePath)) continue;

    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath, ig, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

async function buildFlattenText(
  rootDir: string,
  files: string[],
): Promise<string> {
  let result = "";

  for (const file of files) {
    const fullPath = path.join(rootDir, file);
    const content = await fs.readFile(fullPath, "utf8");

    result += `--- FILE: ${file} ---\n`;
    result += content + "\n\n";
  }

  return result;
}

async function askGPT(
  input: string,
): Promise<{ rules: string; missing: string }> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "너는 Cursor 설정 파일 전문가야. 입력된 프로젝트 파일 내용을 분석해서 `.cursor/rules`와 `missing-features.md`를 작성해야 해.",
      },
      {
        role: "user",
        content: `
프로젝트 파일:

${input}

요약해서 다음 두 파일을 만들어줘:
1. .cursor/rules
2. .cursor/missing-features.md
형식에 맞춰서 파일별로 구분해서 작성해줘.
`,
      },
    ],
  });

  const text = res.choices[0].message.content || "";
  const [rulesPart, missingPart] = text.split(/\.cursor\/missing-features\.md/);

  return {
    rules: rulesPart?.replace(/.*\.cursor\/rules/i, "").trim(),
    missing: missingPart?.trim(),
  };
}

async function main() {
  const cwd = process.cwd();

  if (!(await isGitRepo(cwd))) {
    console.error("이 디렉토리는 git 리포지토리가 아닙니다.");
    process.exit(1);
  }

  const ig = await loadGitIgnore(cwd);
  const files = await walk(cwd, ig);

  console.log(`📄 수집한 파일 개수: ${files.length}`);

  const flatten = await buildFlattenText(cwd, files);
  await fs.writeFile("request.txt", flatten);

  console.log("🤖 GPT에 요청중...");
  const { rules, missing } = await askGPT(flatten);

  await fs.mkdir(".cursor", { recursive: true });
  await fs.writeFile(".cursor/rules", rules);
  await fs.writeFile(".cursor/missing-features.md", missing);

  console.log("✅ .cursor/rules 와 .cursor/missing-features.md 파일 생성 완료");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
