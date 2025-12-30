-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create students table
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  grade TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create classes table
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  schedule TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create class_students junction table
CREATE TABLE public.class_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

-- Create lesson_records table
CREATE TABLE public.lesson_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
  lesson_range TEXT NOT NULL,
  understanding_score INTEGER NOT NULL CHECK (understanding_score >= 1 AND understanding_score <= 5),
  homework_status TEXT NOT NULL CHECK (homework_status IN ('completed', 'partial', 'not_done', 'none_assigned')),
  learning_issues TEXT[] DEFAULT '{}',
  next_lesson_goal TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create weekly_reports table
CREATE TABLE public.weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_lessons INTEGER NOT NULL DEFAULT 0,
  avg_understanding NUMERIC(3,2),
  homework_completion_rate NUMERIC(5,2),
  common_issues TEXT[] DEFAULT '{}',
  summary TEXT,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, week_start)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lesson_records_updated_at BEFORE UPDATE ON public.lesson_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email));
  RETURN NEW;
END;
$$;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles (only admins can manage)
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for students
CREATE POLICY "Admins can do all on students" ON public.students FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Teachers can view students" ON public.students FOR SELECT USING (public.has_role(auth.uid(), 'teacher'));

-- RLS Policies for classes
CREATE POLICY "Admins can do all on classes" ON public.classes FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Teachers can view all classes" ON public.classes FOR SELECT USING (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Teachers can update their own classes" ON public.classes FOR UPDATE USING (teacher_id = auth.uid());

-- RLS Policies for class_students
CREATE POLICY "Admins can do all on class_students" ON public.class_students FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Teachers can view class_students" ON public.class_students FOR SELECT USING (public.has_role(auth.uid(), 'teacher'));

-- RLS Policies for lesson_records
CREATE POLICY "Admins can do all on lesson_records" ON public.lesson_records FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Teachers can view their own records" ON public.lesson_records FOR SELECT USING (teacher_id = auth.uid());
CREATE POLICY "Teachers can insert their own records" ON public.lesson_records FOR INSERT WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "Teachers can update their own records" ON public.lesson_records FOR UPDATE USING (teacher_id = auth.uid());
CREATE POLICY "Teachers can delete their own records" ON public.lesson_records FOR DELETE USING (teacher_id = auth.uid());

-- RLS Policies for weekly_reports
CREATE POLICY "Admins can do all on weekly_reports" ON public.weekly_reports FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Teachers can view reports" ON public.weekly_reports FOR SELECT USING (public.has_role(auth.uid(), 'teacher'));