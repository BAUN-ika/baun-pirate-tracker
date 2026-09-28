export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alliance_relations: {
        Row: {
          alliance_id: string | null
          alliance_tag: string
          created_at: string
          created_by: string | null
          id: string
          relation_type: string
          updated_at: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          alliance_tag: string
          created_at?: string
          created_by?: string | null
          id?: string
          relation_type: string
          updated_at?: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          alliance_tag?: string
          created_at?: string
          created_by?: string | null
          id?: string
          relation_type?: string
          updated_at?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alliance_relations_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alliance_relations_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      alliance_visibility_permissions: {
        Row: {
          alliance_id: string
          can_view_global_clusters: boolean
          can_view_global_highscore: boolean
          can_view_global_map: boolean
          can_view_global_nearest_points: boolean
          created_at: string
          id: string
          updated_at: string
          world_id: string
        }
        Insert: {
          alliance_id: string
          can_view_global_clusters?: boolean
          can_view_global_highscore?: boolean
          can_view_global_map?: boolean
          can_view_global_nearest_points?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          world_id: string
        }
        Update: {
          alliance_id?: string
          can_view_global_clusters?: boolean
          can_view_global_highscore?: boolean
          can_view_global_map?: boolean
          can_view_global_nearest_points?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alliance_visibility_permissions_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: true
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alliance_visibility_permissions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      alliances: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          passcode_hash: string
          tag: string
          world_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          passcode_hash: string
          tag: string
          world_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          passcode_hash?: string
          tag?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alliances_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          baun_passcode_hash: string
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          baun_passcode_hash: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          baun_passcode_hash?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          alliance_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
          world_id: string | null
        }
        Insert: {
          action: string
          alliance_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          world_id?: string | null
        }
        Update: {
          action?: string
          alliance_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      highscore_entries: {
        Row: {
          alliance_id: string | null
          alliance_tag: string | null
          city_name: string | null
          coordinates: string | null
          created_at: string
          id: string
          ikariam_username: string
          period_end: string
          period_start: string
          pirate_points: number
          pirate_round_id: string | null
          rank: number
          source: string
          submission_id: string
          submitted_by_user_id: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          alliance_tag?: string | null
          city_name?: string | null
          coordinates?: string | null
          created_at?: string
          id?: string
          ikariam_username: string
          period_end: string
          period_start: string
          pirate_points: number
          pirate_round_id?: string | null
          rank: number
          source?: string
          submission_id: string
          submitted_by_user_id: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          alliance_tag?: string | null
          city_name?: string | null
          coordinates?: string | null
          created_at?: string
          id?: string
          ikariam_username?: string
          period_end?: string
          period_start?: string
          pirate_points?: number
          pirate_round_id?: string | null
          rank?: number
          source?: string
          submission_id?: string
          submitted_by_user_id?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "highscore_entries_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highscore_entries_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "highscore_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highscore_entries_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      highscore_submissions: {
        Row: {
          alliance_id: string | null
          created_at: string
          entries_count: number
          id: string
          period_end: string
          period_start: string
          pirate_round_id: string | null
          raw_text: string
          source: string
          submitted_by_user_id: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          created_at?: string
          entries_count?: number
          id?: string
          period_end: string
          period_start: string
          pirate_round_id?: string | null
          raw_text: string
          source?: string
          submitted_by_user_id: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          created_at?: string
          entries_count?: number
          id?: string
          period_end?: string
          period_start?: string
          pirate_round_id?: string | null
          raw_text?: string
          source?: string
          submitted_by_user_id?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "highscore_submissions_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highscore_submissions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      highscore_target_status: {
        Row: {
          alliance_id: string | null
          assigned_by_user_id: string | null
          assigned_pirate_name: string | null
          collected_at: string | null
          collected_by_user_id: string | null
          created_at: string
          id: string
          ikariam_username: string
          period_start: string
          pirate_round_id: string | null
          rank: number | null
          started_at: string | null
          status: string
          updated_at: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          assigned_by_user_id?: string | null
          assigned_pirate_name?: string | null
          collected_at?: string | null
          collected_by_user_id?: string | null
          created_at?: string
          id?: string
          ikariam_username: string
          period_start: string
          pirate_round_id?: string | null
          rank?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          assigned_by_user_id?: string | null
          assigned_pirate_name?: string | null
          collected_at?: string | null
          collected_by_user_id?: string | null
          created_at?: string
          id?: string
          ikariam_username?: string
          period_start?: string
          pirate_round_id?: string | null
          rank?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "highscore_target_status_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highscore_target_status_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      ikariam_accounts: {
        Row: {
          alliance_id: string | null
          assigned_by_user_id: string | null
          assigned_pirate_name: string | null
          assignment_started_at: string | null
          assignment_status: string
          collected_by_user_id: string | null
          created_at: string
          current_pirate_points: number
          fortress_coordinates: string | null
          id: string
          ikariam_username: string
          last_collected_at: string | null
          last_updated_at: string
          owner_user_id: string
          points_authoritative_at: string | null
          points_source: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          assigned_by_user_id?: string | null
          assigned_pirate_name?: string | null
          assignment_started_at?: string | null
          assignment_status?: string
          collected_by_user_id?: string | null
          created_at?: string
          current_pirate_points?: number
          fortress_coordinates?: string | null
          id?: string
          ikariam_username: string
          last_collected_at?: string | null
          last_updated_at?: string
          owner_user_id: string
          points_authoritative_at?: string | null
          points_source?: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          assigned_by_user_id?: string | null
          assigned_pirate_name?: string | null
          assignment_started_at?: string | null
          assignment_status?: string
          collected_by_user_id?: string | null
          created_at?: string
          current_pirate_points?: number
          fortress_coordinates?: string | null
          id?: string
          ikariam_username?: string
          last_collected_at?: string | null
          last_updated_at?: string
          owner_user_id?: string
          points_authoritative_at?: string | null
          points_source?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ikariam_accounts_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ikariam_accounts_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_cluster_status: {
        Row: {
          alliance_id: string | null
          assigned_by_user_id: string | null
          assigned_pirate_name: string | null
          cluster_key: string
          collected_at: string | null
          collected_by_user_id: string | null
          created_at: string
          id: string
          period_start: string
          pirate_round_id: string | null
          radius: number
          started_at: string | null
          status: string
          updated_at: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          assigned_by_user_id?: string | null
          assigned_pirate_name?: string | null
          cluster_key: string
          collected_at?: string | null
          collected_by_user_id?: string | null
          created_at?: string
          id?: string
          period_start: string
          pirate_round_id?: string | null
          radius: number
          started_at?: string | null
          status?: string
          updated_at?: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          assigned_by_user_id?: string | null
          assigned_pirate_name?: string | null
          cluster_key?: string
          collected_at?: string | null
          collected_by_user_id?: string | null
          created_at?: string
          id?: string
          period_start?: string
          pirate_round_id?: string | null
          radius?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pirate_cluster_status_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_cluster_status_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_collection_events: {
        Row: {
          alliance_id: string | null
          collected_at: string
          collected_by_name: string
          collected_by_user_id: string | null
          id: string
          pirate_points_collected: number
          pirate_round_id: string | null
          source: string | null
          target_alliance: string | null
          target_coordinates: string | null
          target_username: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          collected_at?: string
          collected_by_name: string
          collected_by_user_id?: string | null
          id?: string
          pirate_points_collected?: number
          pirate_round_id?: string | null
          source?: string | null
          target_alliance?: string | null
          target_coordinates?: string | null
          target_username: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          collected_at?: string
          collected_by_name?: string
          collected_by_user_id?: string | null
          id?: string
          pirate_points_collected?: number
          pirate_round_id?: string | null
          source?: string | null
          target_alliance?: string | null
          target_coordinates?: string | null
          target_username?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pirate_collection_events_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_collection_events_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_missions: {
        Row: {
          alliance_id: string | null
          completed_at: string | null
          completes_at: string
          created_at: string
          id: string
          ikariam_account_id: string
          mission_type: Database["public"]["Enums"]["mission_type"]
          reward_points: number
          started_at: string
          status: Database["public"]["Enums"]["mission_status"]
          user_id: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          completed_at?: string | null
          completes_at: string
          created_at?: string
          id?: string
          ikariam_account_id: string
          mission_type: Database["public"]["Enums"]["mission_type"]
          reward_points: number
          started_at?: string
          status?: Database["public"]["Enums"]["mission_status"]
          user_id: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          completed_at?: string | null
          completes_at?: string
          created_at?: string
          id?: string
          ikariam_account_id?: string
          mission_type?: Database["public"]["Enums"]["mission_type"]
          reward_points?: number
          started_at?: string
          status?: Database["public"]["Enums"]["mission_status"]
          user_id?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pirate_missions_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_missions_ikariam_account_id_fkey"
            columns: ["ikariam_account_id"]
            isOneToOne: false
            referencedRelation: "ikariam_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_missions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_player_assignments: {
        Row: {
          alliance_id: string | null
          coordinates: string | null
          created_at: string
          created_by: string | null
          id: string
          ikariam_username: string
          pirate_user_id: string
          source: string
          updated_at: string
          username_key: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          coordinates?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ikariam_username: string
          pirate_user_id: string
          source?: string
          updated_at?: string
          username_key: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          coordinates?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ikariam_username?: string
          pirate_user_id?: string
          source?: string
          updated_at?: string
          username_key?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pirate_player_assignments_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_player_assignments_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_region_items: {
        Row: {
          alliance_id: string | null
          created_at: string
          id: string
          item_type: string
          region_id: string
          world_id: string | null
          x_end: number
          x_start: number
          y_end: number
          y_start: number
        }
        Insert: {
          alliance_id?: string | null
          created_at?: string
          id?: string
          item_type?: string
          region_id: string
          world_id?: string | null
          x_end: number
          x_start: number
          y_end: number
          y_start: number
        }
        Update: {
          alliance_id?: string | null
          created_at?: string
          id?: string
          item_type?: string
          region_id?: string
          world_id?: string | null
          x_end?: number
          x_start?: number
          y_end?: number
          y_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "pirate_region_items_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_region_items_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "pirate_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_region_items_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_region_players: {
        Row: {
          alliance_id: string | null
          created_at: string
          created_by: string | null
          id: string
          ikariam_username: string
          region_id: string
          username_key: string
          world_id: string | null
          x: number
          y: number
        }
        Insert: {
          alliance_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ikariam_username: string
          region_id: string
          username_key: string
          world_id?: string | null
          x: number
          y: number
        }
        Update: {
          alliance_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ikariam_username?: string
          region_id?: string
          username_key?: string
          world_id?: string | null
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "pirate_region_players_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_region_players_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "pirate_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_region_players_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_regions: {
        Row: {
          alliance_id: string | null
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string | null
          pirate_user_id: string
          updated_at: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          pirate_user_id: string
          updated_at?: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          pirate_user_id?: string
          updated_at?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pirate_regions_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_regions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_rounds: {
        Row: {
          alliance_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          starts_at: string
          status: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          starts_at?: string
          status?: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          starts_at?: string
          status?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pirate_rounds_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_rounds_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      pirate_target_status: {
        Row: {
          alliance_id: string | null
          alliance_tag: string | null
          assigned_by_user_id: string | null
          assigned_pirate_name: string | null
          collected_at: string | null
          collected_by_user_id: string | null
          collected_points: number | null
          coordinates: string | null
          created_at: string
          id: string
          ikariam_username: string
          pirate_round_id: string | null
          rank: number | null
          started_at: string | null
          status: string
          updated_at: string
          username_key: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          alliance_tag?: string | null
          assigned_by_user_id?: string | null
          assigned_pirate_name?: string | null
          collected_at?: string | null
          collected_by_user_id?: string | null
          collected_points?: number | null
          coordinates?: string | null
          created_at?: string
          id?: string
          ikariam_username: string
          pirate_round_id?: string | null
          rank?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
          username_key: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          alliance_tag?: string | null
          assigned_by_user_id?: string | null
          assigned_pirate_name?: string | null
          collected_at?: string | null
          collected_by_user_id?: string | null
          collected_points?: number | null
          coordinates?: string | null
          created_at?: string
          id?: string
          ikariam_username?: string
          pirate_round_id?: string | null
          rank?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
          username_key?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pirate_target_status_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pirate_target_status_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      player_relations: {
        Row: {
          alliance_id: string | null
          created_at: string
          created_by: string | null
          id: string
          ikariam_username: string
          relation_type: string
          updated_at: string
          username_key: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ikariam_username: string
          relation_type: string
          updated_at?: string
          username_key: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ikariam_username?: string
          relation_type?: string
          updated_at?: string
          username_key?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_relations_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_relations_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          username: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          username: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          username?: string
        }
        Relationships: []
      }
      system_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_active_context: {
        Row: {
          alliance_id: string | null
          updated_at: string
          user_id: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          updated_at?: string
          user_id: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          updated_at?: string
          user_id?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_active_context_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_active_context_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memberships: {
        Row: {
          alliance_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          user_id: string
          world_id: string
        }
        Insert: {
          alliance_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          user_id: string
          world_id: string
        }
        Update: {
          alliance_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          user_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memberships_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_memberships_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          alliance_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          world_id: string | null
        }
        Insert: {
          alliance_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          world_id?: string | null
        }
        Update: {
          alliance_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      user_visibility_permissions: {
        Row: {
          can_view_global_clusters: boolean | null
          can_view_global_highscore: boolean | null
          can_view_global_map: boolean | null
          can_view_global_nearest_points: boolean | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          world_id: string
        }
        Insert: {
          can_view_global_clusters?: boolean | null
          can_view_global_highscore?: boolean | null
          can_view_global_map?: boolean | null
          can_view_global_nearest_points?: boolean | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          world_id: string
        }
        Update: {
          can_view_global_clusters?: boolean | null
          can_view_global_highscore?: boolean | null
          can_view_global_map?: boolean | null
          can_view_global_nearest_points?: boolean | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_visibility_permissions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      worlds: {
        Row: {
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by: string | null
          flag_emoji: string | null
          id: string
          name: string
          timezone: string
        }
        Insert: {
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          created_by?: string | null
          flag_emoji?: string | null
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          created_by?: string | null
          flag_emoji?: string | null
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_pirate_round_id: { Args: never; Returns: string }
      active_pirate_round_id_for: {
        Args: { _alliance_id: string }
        Returns: string
      }
      complete_due_pirate_missions: { Args: never; Returns: number }
      complete_due_pirate_rounds: { Args: never; Returns: number }
      current_alliance_id: { Args: never; Returns: string }
      current_world_id: { Args: never; Returns: string }
      has_alliance_role: {
        Args: {
          _alliance_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_alliance_member: {
        Args: { _alliance_id: string; _user_id: string }
        Returns: boolean
      }
      is_system_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "glavni_pirat"
        | "korisnik"
        | "pirat"
        | "ide_na_plasman"
      mission_status: "pending" | "completed" | "cancelled"
      mission_type: "mission_8h" | "mission_16h"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "glavni_pirat",
        "korisnik",
        "pirat",
        "ide_na_plasman",
      ],
      mission_status: ["pending", "completed", "cancelled"],
      mission_type: ["mission_8h", "mission_16h"],
    },
  },
} as const
