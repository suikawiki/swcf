use strict;
use warnings;
use utf8;
use JSON::PS;

binmode STDOUT, qw(:encoding(utf-8));

my $Data;
{
  local $/ = undef;
  $Data = json_bytes2perl <>;
}

for my $group_key (sort { $a cmp $b } keys %{$Data->{groups}}) {
  my $group = $Data->{groups}->{$group_key};
  next unless grep { not $_->{tags}->{noglyph} } map { $Data->{items}->{$_} } @{$group->{region_refs}};

  my $script = $group->{script} // '';
  next unless $script =~ /\A[A-Z]+\z/;
  
  my $variant = $group->{variant};
  die "Bad variant |$group->{variant}|" unless $variant =~ /^[0-9]+$/;

  my $style = $group->{style};
  die "Bad style |$group->{style}|" unless $style =~ /^[0-9]+$/;

  my $t = $group->{value};
  next unless length $t;
  
  printf '%s%d"%s" %%u%d', $script, $variant, $t, $style;

  if (defined $group->{chosen_region_ref}) {
    my $item = $Data->{items}->{$group->{chosen_region_ref}} // die;
    print ' ' . $group->{chosen_region_ref};
    print " %tfmarkrt" if $item->{tags}->{rt};
  }

  print "\x0A";
}

## License: Public Domain.
