import test from "node:test";import assert from "node:assert/strict";import {signClaims,verifyClaims,can} from "../src/auth.mjs";import {seal,open} from "../src/vault.mjs";
const secret="x".repeat(64),claims={tenantId:"t1",userId:"u1",role:"developer"};
test("signed tenant claims reject tampering and expiry",()=>{const token=signClaims(claims,secret,60,()=>1000);assert.equal(verifyClaims(token,secret,()=>2000).tenantId,"t1");assert.throws(()=>verifyClaims(token+"x",secret,()=>2000));assert.throws(()=>verifyClaims(token,secret,()=>100000))});
test("role permissions are explicit",()=>{assert.equal(can(claims,"job:create"),true);assert.equal(can(claims,"job:approve"),false);assert.equal(can({...claims,role:"owner"},"job:approve"),true)});
test("vault binds ciphertext to tenant metadata",()=>{const box=seal("github-secret",secret,"t1:github");assert.equal(open(box,secret,"t1:github"),"github-secret");assert.throws(()=>open(box,secret,"t2:github"))});
