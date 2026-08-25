import test from "node:test";
import assert from "node:assert/strict";
import {completionContext,completionPrompt,localInlineCompletion} from "../src/completion.mjs";

test("inline completion reuses the strongest in-file symbol without duplicating typed text",()=>{
  const source="const customerProfile = load();\ncustomerProfile.save();\nconst value = customerPro";
  assert.deepEqual(localInlineCompletion(source,source.length),{insertText:"file",candidate:"customerProfile",source:"local-context"});
});

test("completion context is bounded and prompt marks the cursor",()=>{
  const text="x".repeat(20000),ctx=completionContext(text,text.length);
  assert.equal(ctx.prefix.length,12000);
  assert.match(completionPrompt({path:"app.ts",text:"const total = ",offset:14}),/FILE app\.ts[\s\S]*<CURSOR>/);
});

test("short or unknown prefixes do not create noisy suggestions",()=>{
  assert.equal(localInlineCompletion("const alpha = 1;\na",19),null);
  assert.equal(localInlineCompletion("const alpha = 1;\nunknown",24),null);
});
