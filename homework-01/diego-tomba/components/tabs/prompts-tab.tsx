'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import { api, type PromptView } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import { Badge, Spinner, EmptyState } from '@/components/ui/misc';

export function PromptsTab() {
  const [prompts, setPrompts] = useState<PromptView[]>([]);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [adding, setAdding] = useState(false);

  const load = () => api.listPrompts().then(setPrompts);
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!name || !content) return;
    setAdding(true);
    try {
      await api.createPrompt({ name, content });
      setName('');
      setContent('');
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function activate(id: number) {
    await api.activatePrompt(id);
    await load();
  }

  async function remove(id: number) {
    await api.deletePrompt(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input
              placeholder="es. Tono tecnico, in italiano"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Istruzioni per il narratore AI</Label>
            <Textarea
              placeholder="Scrivi in italiano, tono conciso e tecnico. Dai priorità alle PR di sicurezza e alle breaking change…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <Button onClick={add} disabled={adding || !name || !content}>
            {adding ? <Spinner /> : <Plus className="h-4 w-4" />}
            Aggiungi prompt
          </Button>
        </CardContent>
      </Card>

      {prompts.length === 0 ? (
        <EmptyState
          title="Nessun prompt (facoltativo)"
          hint="I prompt sono opzionali: senza, il narratore usa le istruzioni di default. Creane uno per guidarne lo stile; quello attivo viene applicato a ogni report."
        />
      ) : (
        <div className="space-y-3">
          {prompts.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{p.name}</span>
                    {p.isActive && (
                      <Badge tone="accent">
                        <Star className="h-3 w-3" /> attivo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-400">
                    {p.content}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!p.isActive && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => activate(p.id)}
                    >
                      Attiva
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(p.id)}
                    title="Rimuovi"
                  >
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
