import { StateCreator } from 'zustand';
import { Client, NewClient } from '../../types.ts';
import { AppState } from '../useAppStore.tsx';
import { supabase } from '../../lib/supabaseClient.ts';

export interface ClientSlice {
  clients: Client[];
  fetchClients: () => Promise<void>;
  getClientById: (id: string) => Client | undefined;
  getClientByName: (name: string) => Client | undefined;
  addClient: (client: NewClient) => Promise<Client | null>;
  updateClient: (client: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
}

export const createClientSlice: StateCreator<AppState, [], [], ClientSlice> = (set, get) => ({
    clients: [],
    
    fetchClients: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return; // Silent guard para RLS

        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            if (data) set({ clients: data as Client[] });
        } catch (error) {
            console.error('Error fetching clients:', error);
        }
    },

    getClientById: (id) => get().clients.find(c => c.id === id),
    
    getClientByName: (name) => get().clients.find(c => c.name.toLowerCase() === name.toLowerCase()),
    
    addClient: async (client) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user authenticated');

            const newClientData = { ...client, user_id: user.id };
            
            const { data, error } = await supabase
                .from('clients')
                .insert(newClientData)
                .select()
                .single();

            if (error) throw error;
            
            if (data) {
                const createdClient = data as Client;
                set(state => ({ clients: [createdClient, ...state.clients] }));
                return createdClient;
            }
        } catch (error) {
            console.error('Error adding client:', error);
        }
        return null;
    },

    updateClient: async (client) => {
        try {
            const { error } = await supabase
                .from('clients')
                .update({ 
                    name: client.name, 
                    company: client.company, 
                    email: client.email, 
                    phone: client.phone,
                    tax_id: client.tax_id,
                    address: client.address
                })
                .eq('id', client.id);

            if (error) throw error;

            set(state => ({ clients: state.clients.map(c => c.id === client.id ? client : c) }));
        } catch (error) {
            console.error('Error updating client:', error);
        }
    },

    deleteClient: async (id) => {
        try {
            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', id);

            if (error) throw error;

            set(state => ({
                clients: state.clients.filter(c => c.id !== id),
                projects: state.projects.filter(p => p.client_id !== id),
                invoices: state.invoices.filter(i => i.client_id !== id),
            }));
        } catch (error) {
            console.error('Error deleting client:', error);
        }
    },
});