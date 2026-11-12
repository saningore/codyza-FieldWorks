# FieldWorks

FieldWorks is a project and operations workspace. The organization kind decides the records: a farm has fields and inputs, an engineering team has issues and decisions, a class has a gradebook, a student has a term, and a practice has clients and time. A new signup starts empty. Sample organizations wear a banner, and every chart sums stored rows.

## Run locally

Node.js 22 and Docker.

```bash
npm install
copy .env.example .env
npm run setup
npm run dev
```

Open http://localhost:3100. `npm run setup` starts Postgres on port 54332, applies `db/migrations/001_schema.sql`, and loads the sample organizations.

## Demo accounts

Every account uses the password `Harbor-lamp-42`. Owner accounts also require the authenticator secret.

| Organization | Person | Role | Email | Authenticator |
| --- | --- | --- | --- | --- |
| Northline Acres | June Okoye | Owner | june.okoye@northline.test | `JBSWY3DPEHPK3PXP` |
| Northline Acres | Sam Okonkwo | Operator | sam.okonkwo@northline.test | none |
| Northline Acres | Lee Ortiz | Advisor | lee.ortiz@northline.test | none |
| Northline Acres | Jordan Hale | Viewer | jordan.hale@northline.test | none |
| Harbor Systems | Andre Brooks | Owner | andre.brooks@harbor.test | `MFRGGZDFMZTWQ2LK` |
| Harbor Systems | Pat Nguyen | Member | pat.nguyen@harbor.test | none |
| Westfield | Riley Chen | Owner | riley.chen@westfield.test | `ORUGS4ZANFZSAYLO` |
| Westfield | Maria Santos | Teacher | maria.santos@westfield.test | none |
| Westfield | Alex Morgan | Student | alex.morgan@westfield.test | none |
| Westfield | Sam Student | Student | sam.student@westfield.test | none |
| Jordan Hale | Jordan Hale | Owner | jordan.study@fieldworks.test | `GEZDGNBVGY3TQOJQ` |
| Okoye Studio | Ada Okoye | Owner | ada.okoye@studio.test | `ORSXG5DTMVRXEZLU` |

North Field has a priced harvest. South Field has a harvest with no sale price, so margin stays blank. Biology 101 has posted work. Open period has a roster and no grades. Calculus shows a grade based on 60 percent of the recorded weight.

## Checks

```bash
npm test
npm run test:integration
npm run test:e2e
```

## Reviewer path

1. Open the site. The FieldWorks link and the Codyza link are on the page.
2. Sign in as Jordan Hale at Northline. Expenses are absent.
3. Sign in as Lee and save a recommendation. Expenses stay absent.
4. Sign in as June. The yield chart names North Field, and a load has no sale price.
5. Sign out. The workspace redirects to sign in.
6. Sign in as Alex. The gradebook URL and Sam's submission URL do not open. Submit the lab report.
7. Sign in as Maria. Open period has no posted grades. Biology shows Essay: 1 of 2.
8. Sign in as Jordan's study account. Calculus says the grade is based on 60 percent of the recorded weight.
9. Create a farm workspace. Charts say nothing has been recorded.
10. Forgot password shows the same notice for an unknown email.

Powered by [Codyza](https://codyza.com).
