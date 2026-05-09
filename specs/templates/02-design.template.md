# Phase 2: Architecture & Design

> **Spec:** [SPEC-ID]
> **Architect Agent:** Claude Code
> **Date:** [Date]
> **Status:** In Progress | Ready for Review | Approved

---

## 1. Design Overview

### 1.1 Solution Summary
[High-level description of the proposed solution]

### 1.2 Design Principles Applied
- [Principle 1 - e.g., DRY, SOLID, etc.]
- [Principle 2]
- [Principle 3]

---

## 2. Codebase Analysis

### 2.1 Existing Patterns Identified
| Pattern | Location | Will Reuse? |
|---------|----------|-------------|
| [Pattern name] | `path/to/example.ts` | Yes/No |

### 2.2 Related Existing Code
| File | Relevance | Action |
|------|-----------|--------|
| `path/to/file.ts` | [Why relevant] | Reference/Modify/Extend |

### 2.3 Conventions to Follow
- **Naming:** [Conventions from codebase]
- **File Structure:** [How files are organized]
- **Error Handling:** [How errors are handled]
- **Testing:** [Testing patterns used]

---

## 3. Architecture Design

### 3.1 Component Diagram
```
┌─────────────────┐     ┌─────────────────┐
│   Component A   │────▶│   Component B   │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Component C   │
└─────────────────┘
```

### 3.2 Data Flow
```
[Input] ──▶ [Process 1] ──▶ [Process 2] ──▶ [Output]
```

### 3.3 Key Interfaces/Contracts
```typescript
// Example interface definition
interface IExampleService {
  method1(param: Type): ReturnType;
  method2(param: Type): Promise<ReturnType>;
}
```

---

## 4. File Structure

### 4.1 New Files to Create

| File Path | Purpose | Template/Base |
|-----------|---------|---------------|
| `path/to/new-file.ts` | [Description] | [Reference if any] |

### 4.2 Files to Modify

| File Path | Changes | Impact |
|-----------|---------|--------|
| `path/to/existing.ts` | [What to change] | Low/Med/High |

### 4.3 Files NOT to Touch
| File Path | Reason |
|-----------|--------|
| `path/to/protected.ts` | [Why not modify] |

---

## 5. Implementation Plan

### 5.1 Implementation Sequence

```
Step 1: [Description]
   └── Creates: file1.ts, file2.ts
   └── Modifies: file3.ts

Step 2: [Description] (depends on Step 1)
   └── Creates: file4.ts
   └── Modifies: file1.ts

Step 3: [Description] (depends on Step 2)
   └── Creates: file5.ts
```

### 5.2 Detailed Steps

#### Step 1: [Step Name]
- **Goal:** [What this step achieves]
- **Files:**
  - Create `path/to/file.ts`
  - Modify `path/to/other.ts`
- **Key Implementation Notes:**
  - [Note 1]
  - [Note 2]
- **Estimated Complexity:** Low/Medium/High

#### Step 2: [Step Name]
[Repeat structure]

---

## 6. Testing Strategy

### 6.1 Test Files to Create
| Test File | Tests For | Type |
|-----------|-----------|------|
| `path/to/test.spec.ts` | [What it tests] | Unit/Integration/E2E |

### 6.2 Test Coverage Goals
- [ ] All public methods have unit tests
- [ ] Happy path covered
- [ ] Error cases covered
- [ ] Edge cases covered

### 6.3 Test Data Requirements
- [What test data/fixtures are needed]

---

## 7. Dependencies

### 7.1 New Dependencies Required
| Package | Version | Reason |
|---------|---------|--------|
| [package-name] | ^x.x.x | [Why needed] |

### 7.2 No New Dependencies Needed
[Confirm if no new deps required]

---

## 8. Migration/Rollback Plan

### 8.1 Breaking Changes
- [ ] No breaking changes
- [ ] Breaking changes: [List them]

### 8.2 Rollback Strategy
[How to revert if something goes wrong]

---

## 9. Design Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| [Decision 1] | A, B, C | B | [Why B was chosen] |

---

## 10. Design Review Checklist

- [ ] Follows existing codebase patterns
- [ ] No unnecessary complexity
- [ ] Clear separation of concerns
- [ ] Testable design
- [ ] No breaking changes (or documented)
- [ ] Security considerations addressed
- [ ] Performance implications considered

**Design Status:** ✅ Ready for Implementation | ⚠️ Needs Review | ❌ Requires Revision

---

## Handoff to Implementation Agent

**Implementation Priority:**
1. [First thing to implement]
2. [Second thing to implement]
3. [Third thing to implement]

**Critical Constraints:**
- [Constraint 1]
- [Constraint 2]

**Reference Files:**
- [Key file to study before implementing]
