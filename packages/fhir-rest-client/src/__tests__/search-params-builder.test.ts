/**
 * SearchParamsBuilder Tests (QUERY-01)
 */

import { describe, it, expect } from "vitest";
import { SearchParamsBuilder } from "../query/search-params-builder.js";

describe("SearchParamsBuilder", () => {
  it("where/is builds simple param", () => {
    const params = new SearchParamsBuilder().where("name").is("Smith").build();
    expect(params).toEqual({ name: "Smith" });
  });

  it("ge prefix", () => {
    const params = new SearchParamsBuilder().where("birthdate").ge("2000-01-01").build();
    expect(params).toEqual({ birthdate: "ge2000-01-01" });
  });

  it("le prefix", () => {
    const params = new SearchParamsBuilder().where("date").le("2025-12-31").build();
    expect(params).toEqual({ date: "le2025-12-31" });
  });

  it("gt and lt prefixes", () => {
    const params = new SearchParamsBuilder()
      .where("age").gt("18")
      .where("age").lt("65")
      .build();
    expect(params).toEqual({ age: ["gt18", "lt65"] });
  });

  it("contains modifier", () => {
    const params = new SearchParamsBuilder().where("name").contains("Smi").build();
    expect(params).toEqual({ "name:contains": "Smi" });
  });

  it("exact modifier", () => {
    const params = new SearchParamsBuilder().where("name").exact("Smith").build();
    expect(params).toEqual({ "name:exact": "Smith" });
  });

  it("missing modifier", () => {
    const params = new SearchParamsBuilder().where("email").missing(true).build();
    expect(params).toEqual({ "email:missing": "true" });
  });

  it("_include", () => {
    const params = new SearchParamsBuilder().include("Patient", "organization").build();
    expect(params).toEqual({ _include: "Patient:organization" });
  });

  it("_revinclude", () => {
    const params = new SearchParamsBuilder().revInclude("Observation", "subject").build();
    expect(params).toEqual({ _revinclude: "Observation:subject" });
  });

  it("sort ascending", () => {
    const params = new SearchParamsBuilder().sort("name").build();
    expect(params).toEqual({ _sort: "name" });
  });

  it("sort descending", () => {
    const params = new SearchParamsBuilder().sort("date", true).build();
    expect(params).toEqual({ _sort: "-date" });
  });

  it("count and offset", () => {
    const params = new SearchParamsBuilder().count(10).offset(20).build();
    expect(params).toEqual({ _count: "10", _offset: "20" });
  });

  it("summary", () => {
    const params = new SearchParamsBuilder().summary("count").build();
    expect(params).toEqual({ _summary: "count" });
  });

  it("elements", () => {
    const params = new SearchParamsBuilder().elements("id", "name", "birthDate").build();
    expect(params).toEqual({ _elements: "id,name,birthDate" });
  });

  it("chain multiple clauses", () => {
    const params = new SearchParamsBuilder()
      .where("name").is("Smith")
      .where("birthdate").ge("2000-01-01")
      .include("Patient", "organization")
      .sort("name")
      .count(10)
      .build();
    expect(params).toEqual({
      name: "Smith",
      birthdate: "ge2000-01-01",
      _include: "Patient:organization",
      _sort: "name",
      _count: "10",
    });
  });

  it("toQueryString", () => {
    const qs = new SearchParamsBuilder().where("name").is("Smith").count(10).toQueryString();
    expect(qs).toBe("name=Smith&_count=10");
  });

  it("throws if no where() before value", () => {
    expect(() => new SearchParamsBuilder().is("Smith")).toThrow("Call .where(param)");
  });

  it("multiple values for same param become array", () => {
    const params = new SearchParamsBuilder()
      .where("status").is("active")
      .where("status").is("inactive")
      .build();
    expect(params).toEqual({ status: ["active", "inactive"] });
  });
});
