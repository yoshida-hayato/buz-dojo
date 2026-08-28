#!/usr/bin/env node
/** 単一正誤: choices を常に ["正","誤"]、answer で正解（"正"|"誤"）を明示 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../data/judgment-questions.js");
let src = fs.readFileSync(file, "utf8");

let n = 0;
src = src.replace(
  /choices: \["(正|誤)","(正|誤)"\]/g,
  (m, a, b) => {
    if (a === "正" && b === "誤") {
      n++;
      return 'choices: ["正","誤"], answer: "正"';
    }
    if (a === "誤" && b === "正") {
      n++;
      return 'choices: ["正","誤"], answer: "誤"';
    }
    throw new Error(`Unexpected choices: ${m}`);
  }
);

fs.writeFileSync(file, src);
console.log(`Normalized ${n} single judgment questions.`);
