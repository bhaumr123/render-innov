# Getting Started

This guide explains how to run the TripCraft backend locally for development.

## Prerequisites

- Node.js (LTS version recommended)
- npm
- A local or remote database instance (see your environment configuration)

## 1. Clone the Repository

```
git clone https://github.com/your-org/tripcraft-app.git
cd tripcraft-app
```

## 2. Install Dependencies

```
npm install
```

## 3. Configure Environment Variables

Copy the example environment file and update the values as needed:

```
cp .env.example .env
```

At minimum, make sure the following variables are set:

- `PORT` - the port the backend server will listen on
- `DATABASE_URL` - connection string for your database

## 4. Run Database Migrations

If the project uses migrations, apply them before starting the server:

```
npm run migrate
```

## 5. Start the Backend Server

```
npm run dev
```

The server should now be running locally, typically at `http://localhost:3000` (or whichever port you configured).

## 6. Verify It's Working

Open your browser or use a tool like `curl` to hit a health check endpoint:

```
curl http://localhost:3000/health
```

You should receive a success response confirming the backend is up and running.

## Next Steps

- See other docs in the `docs/` folder for additional setup and usage details.
