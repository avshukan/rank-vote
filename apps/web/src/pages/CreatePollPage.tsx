import { CreatePollForm } from '../features/create-poll/CreatePollForm';

export function CreatePollPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Create a ranked poll</h1>
      <CreatePollForm />
    </main>
  );
}
